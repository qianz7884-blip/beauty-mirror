import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tutorial = lazy(() => import('./pages/Tutorial'))
const ProductManage = lazy(() => import('./pages/ProductManage'))
const MakeupDiary = lazy(() => import('./pages/MakeupDiary'))
const DiaryDetail = lazy(() => import('./pages/DiaryDetail'))
const Profile = lazy(() => import('./pages/Profile'))

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="bm-route-loading" role="status">正在打开页面…</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductManage />} />
          <Route path="/diary" element={<MakeupDiary />} />
          <Route path="/diary/:id" element={<DiaryDetail />} />
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
