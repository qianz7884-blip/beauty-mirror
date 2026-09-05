import { Briefcase, Heart, PartyPopper, Sun } from 'lucide-react'

export const TIME_OPTIONS = [
  { id: 'quick', label: '5分钟救急', minutes: 5, keywords: '镜前急救 提气色 局部补救' },
  { id: 'daily', label: '15分钟日常', minutes: 15, keywords: '基础日常妆 通勤自然妆' },
  { id: 'complete', label: '30分钟完整', minutes: 30, keywords: '完整日常妆 约会拍照妆' },
]

export const PHOTO_CAPTURE_TIPS = [
  '脸正对镜头，鼻梁尽量在中线',
  '两只眼睛高度接近，不歪头不侧脸',
  '发际线、眉毛、下巴都要露出来',
  '用正面柔光，脸占画面六到七成',
]

export const VIDEO_PLATFORMS = [
  {
    id: 'douyin',
    label: '抖音',
    buildUrl: query => `https://www.douyin.com/search/${encodeURIComponent(query)}?type=video`,
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    buildUrl: query => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_explore_feed`,
  },
]

export const SCENES = [
  {
    id: 'commute',
    label: '通勤',
    title: '通勤自然妆教程',
    icon: Briefcase,
    focus: '干净、自然、耐看，减少复杂步骤',
    searchFocus: '通勤妆 自然底妆 持妆',
  },
  {
    id: 'date',
    label: '约会',
    title: '约会氛围妆教程',
    icon: Heart,
    focus: '提气色、柔和、有亲近感',
    searchFocus: '约会妆 氛围感 腮红 唇妆',
  },
  {
    id: 'party',
    label: '聚会',
    title: '聚会上镜妆教程',
    icon: PartyPopper,
    focus: '加强眼妆和轮廓，上镜不吃妆',
    searchFocus: '聚会妆 上镜 持妆 眼妆',
  },
  {
    id: 'daily',
    label: '日常',
    title: '日常基础妆教程',
    icon: Sun,
    focus: '简单稳定，适合反复练习',
    searchFocus: '日常妆 新手 基础步骤',
  },
]

export const PRODUCT_PRIORITY = {
  commute: ['防晒', '底妆', '定妆', '眉眼', '唇妆'],
  date: ['底妆', '遮瑕', '腮红修容', '眉眼', '唇妆'],
  party: ['底妆', '遮瑕', '定妆', '眉眼', '腮红修容', '唇妆'],
  daily: ['防晒', '底妆', '眉眼', '唇妆'],
}

export const CATEGORY_ALIASES = {
  防晒: ['防晒', '防晒霜', '隔离'],
  底妆: ['底妆', '粉底', '粉霜', '气垫', '妆前乳', '隔离'],
  遮瑕: ['遮瑕', '遮瑕膏', '遮瑕液'],
  定妆: ['定妆', '散粉', '粉饼', '定妆喷雾'],
  眉眼: ['眉眼', '眉笔', '眼影', '眼线', '睫毛', '睫毛膏'],
  腮红修容: ['腮红修容', '腮红', '修容', '高光', '阴影'],
  唇妆: ['唇妆', '口红', '唇膏', '唇釉', '唇蜜'],
}

export const TIME_STAGE_BLUEPRINTS = {
  quick: [
    { minute: 0, label: '妆前整理', category: '防晒', action: '快速保湿或防晒，压掉明显浮油' },
    { minute: 1, label: '局部底妆', category: '底妆', action: '只处理泛红、暗沉和鼻翼边界' },
    { minute: 3, label: '眉眼提神', category: '眉眼', action: '补眉尾和睫毛根部，不铺复杂眼影' },
    { minute: 4, label: '唇颊提气色', category: '唇妆', action: '唇色优先，少量带到脸颊统一气色' },
  ],
  daily: [
    { minute: 0, label: '妆前 / 防晒', category: '防晒', action: '让皮肤稳定，后续底妆更服帖' },
    { minute: 2, label: '薄底妆', category: '底妆', action: '从面中铺开，边缘少量带过' },
    { minute: 5, label: '局部遮瑕', category: '遮瑕', action: '只点压眼下、鼻翼、痘印' },
    { minute: 8, label: '眉眼定神', category: '眉眼', action: '眉毛和眼线控制在自然范围' },
    { minute: 11, label: '腮红 / 修容', category: '腮红修容', action: '少量多次调整气色和轮廓' },
    { minute: 13, label: '唇妆', category: '唇妆', action: '和腮红保持同一气色方向' },
  ],
  complete: [
    { minute: 0, label: '妆前准备', category: '防晒', action: '保湿、防晒、等待成膜' },
    { minute: 4, label: '完整底妆', category: '底妆', action: '分区上妆，控制厚度和边界' },
    { minute: 9, label: '遮瑕校正', category: '遮瑕', action: '暗沉、瑕疵、眼下分开处理' },
    { minute: 13, label: '定妆', category: '定妆', action: 'T 区和易脱妆区优先' },
    { minute: 16, label: '眉眼', category: '眉眼', action: '眼影、眼线、睫毛按场景加强' },
    { minute: 22, label: '腮红 / 修容', category: '腮红修容', action: '调整面中、颧骨和下颌线' },
    { minute: 26, label: '唇妆', category: '唇妆', action: '完成整体色彩平衡' },
  ],
}
