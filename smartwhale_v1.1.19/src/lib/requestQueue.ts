// ── 全局业务请求并发队列（FRD 3.2/3.3/4.3 第 3 重防护）─────────────────────
// 全局最大允许同时业务并发请求数 MAX_CONCURRENT=2；超出进入排队。
// 排队中的任务可被丢弃（Tab 再次切走时取消，避免无效后台执行，FRD 3.3 快速多Tab防护）。
//
// 设计要点：
//  - 每个 Tab 的「整套并发请求」视为一个任务单元入队，避免单 Tab 内部 6 个接口各占一个槽位
//    导致全局槽位被一个 Tab 占满；这样 MAX_CONCURRENT 控制的是「同时进行的 Tab 套数」。
//  - 任务入队时返回一个可取消的句柄；cancel 后若仍在排队则直接丢弃，若已执行则标记，
//    由调用方通过 cancelRef/seq 在回调里跳过 setState。
//  - tag（cacheKey 前缀/Tab 名）用于「点击某 Tab 优先、取消其余排隊任务」：用户点某 Tab 时，
//    该 Tab 请求优先，排队的其它 Tab 请求直接取消，避免登录后 5 Tab 同時入队导致点某页其请求还在排隊不显示，
//    同时降低瞬间 QPS 减少触发 WAF 限速。

export const MAX_CONCURRENT = 2; // maxConcurrentReq

type Task<T> = () => Promise<T>;

interface QueuedTask<T> {
  id: number;
  run: Task<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
  cancelled: { current: boolean };
  tag: string; // 归属标识（cacheKey 前缀 / Tab 名），用于「点击某 Tab 优先、取消其余」
}

let running = 0;
const queue: QueuedTask<any>[] = [];
let seqCounter = 0;

function pump(): void {
  if (running >= MAX_CONCURRENT) return;
  const next = queue.shift();
  if (!next) return;

  // 出队时若已取消（Tab 切走丢弃），直接 reject 跳过，不占槽位
  if (next.cancelled.current) {
    next.reject(makeCancelError());
    pump();
    return;
  }

  running++;
  Promise.resolve()
    .then(() => next.run())
    .then(
      (v) => { next.resolve(v); },
      (e) => { next.reject(e); }
    )
    .finally(() => {
      running--;
      pump();
    });
}

export function makeCancelError(): Error {
  const e = new Error("request-cancelled");
  (e as any).isCancel = true;
  return e;
}

export function isCancelError(e: any): boolean {
  return !!(e && e.isCancel);
}

/**
 * 入队一个任务。返回 Promise；
 * 若 cancelRef.current 在出队前被置 true，则 Promise 以 cancel 错误 reject（不执行、不占槽位）。
 * tag 用于「点击某 Tab 优先、取消其余排队任务」（见 cancelQueuedExcept）。
 */
export function enqueue<T>(task: Task<T>, cancelRef: { current: boolean }, tag: string = ""): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const item: QueuedTask<T> = {
      id: ++seqCounter,
      run: task,
      resolve,
      reject,
      cancelled: cancelRef,
      tag,
    };
    queue.push(item);
    pump();
  });
}

/** 当前排队长度（调试/可观测用） */
export function queueLength(): number {
  return queue.length;
}

/**
 * 清空所有排隊中（尚未执行）的任务，全部以 cancel 错误 reject。
 * 用于登出时取消残留的 Tab 数据请求，避免退出后仍发出旧请求占用 QPS / 触发限速。
 */
export function clearQueue(): void {
  while (queue.length > 0) {
    const item = queue.shift()!;
    item.reject(makeCancelError());
  }
}

/**
 * 取消排隊中「不属于当前 tag」的任务（立即 reject，不执行）。
 * 用途：用户点击某 Tab 时，该 Tab 请求优先，排队的其它 Tab 请求直接取消，
 * 避免登录后 5 个 Tab 同时入队、点击「我的」时其请求还在排隊导致数据不显示；
 * 同时降低瞬间 QPS，减少触发 WAF 限速。
 */
export function cancelQueuedExcept(tag: string): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].tag !== tag) {
      const item = queue.splice(i, 1)[0];
      item.reject(makeCancelError());
    }
  }
}
