// Spine 动画资源注册表
// 每个资源包含：纹理图片（Metro 资源 id）、骨骼数据（Metro 解析为对象）、图集文本（内联模块）

import choujiangyePng from '../../assets/spine/choujiangye.png';
import choujiangyeJson from '../../assets/spine/choujiangye.json';

import whale1Png from '../../assets/spine/whale1.png';
import whale1Json from '../../assets/spine/whale1.json';
import whale2Png from '../../assets/spine/whale2.png';
import whale2Json from '../../assets/spine/whale2.json';
import whale3Png from '../../assets/spine/whale3.png';
import whale3Json from '../../assets/spine/whale3.json';
import whale4Png from '../../assets/spine/whale4.png';
import whale4Json from '../../assets/spine/whale4.json';
import whale5Png from '../../assets/spine/whale5.png';
import whale5Json from '../../assets/spine/whale5.json';
import whale6Png from '../../assets/spine/whale6.png';
import whale6Json from '../../assets/spine/whale6.json';
import whale7Png from '../../assets/spine/whale7.png';
import whale7Json from '../../assets/spine/whale7.json';

import {
  CHOUJIANGYE_ATLAS,
  WHALE1_ATLAS,
  WHALE2_ATLAS,
  WHALE3_ATLAS,
  WHALE4_ATLAS,
  WHALE5_ATLAS,
  WHALE6_ATLAS,
  WHALE7_ATLAS,
} from '@/lib/spineAtlas';

export interface SpineResource {
  key: string;
  label: string;
  png: number;
  json: object;
  atlas: string;
}

export const SPINE_RESOURCES: SpineResource[] = [
  { key: 'choujiangye', label: '抽奖页', png: choujiangyePng, json: choujiangyeJson, atlas: CHOUJIANGYE_ATLAS },
  { key: 'whale1', label: '鲸鱼1', png: whale1Png, json: whale1Json, atlas: WHALE1_ATLAS },
  { key: 'whale2', label: '鲸鱼2', png: whale2Png, json: whale2Json, atlas: WHALE2_ATLAS },
  { key: 'whale3', label: '鲸鱼3', png: whale3Png, json: whale3Json, atlas: WHALE3_ATLAS },
  { key: 'whale4', label: '鲸鱼4', png: whale4Png, json: whale4Json, atlas: WHALE4_ATLAS },
  { key: 'whale5', label: '鲸鱼5', png: whale5Png, json: whale5Json, atlas: WHALE5_ATLAS },
  { key: 'whale6', label: '鲸鱼6', png: whale6Png, json: whale6Json, atlas: WHALE6_ATLAS },
  { key: 'whale7', label: '鲸鱼7', png: whale7Png, json: whale7Json, atlas: WHALE7_ATLAS },
];