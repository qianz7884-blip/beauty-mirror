export const ALL_PRODUCTS_CATEGORY = '全部'

export const RECOMMENDATION_TAG_FIELDS = [
  {
    field: 'usage_steps',
    label: '适合步骤',
    options: ['护肤', '妆前', '底妆', '遮瑕', '定妆', '眼妆', '唇妆', '补妆'],
  },
  {
    field: 'product_features',
    label: '产品特点',
    options: ['保湿', '清爽', '控油', '修护', '提亮', '遮瑕', '持妆', '舒缓'],
  },
  {
    field: 'suitable_regions',
    label: '适合区域',
    options: ['T区', '鼻翼', '眼下', '唇周', '脸颊', '下颌', '全脸'],
  },
  {
    field: 'suitable_scenes',
    label: '适合场景',
    options: ['通勤', '办公室', '晚间出门', '拍照', '干燥天气', '潮湿天气'],
  },
  {
    field: 'user_feedback',
    label: '我的反馈',
    options: ['好用', '持妆好', '不卡粉', '容易卡粉', '搓泥', '闷痘', '太油', '太干'],
  },
]

export const PRODUCT_DETAIL_TAG_FIELDS = [
  { field: 'usage_steps', label: '适合步骤' },
  { field: 'product_features', label: '产品特点' },
  { field: 'suitable_regions', label: '适合区域' },
  { field: 'suitable_scenes', label: '适合场景' },
  { field: 'user_feedback', label: '我的反馈' },
]

export const PRODUCT_KNOWLEDGE_FIELDS = [
  { field: 'ingredients', label: '核心成分' },
  { field: 'efficacy', label: '功效说明' },
  { field: 'usage_instructions', label: '使用方法' },
  { field: 'suitable_skin', label: '适合肤质' },
]
