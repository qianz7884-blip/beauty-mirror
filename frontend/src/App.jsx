import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProductManage from './pages/ProductManage'
import MyCosmetics from './pages/MyCosmetics'
import MakeupDiary from './pages/MakeupDiary'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<ProductManage />} />
        <Route path="/gallery" element={<MyCosmetics />} />
        <Route path="/diary" element={<MakeupDiary />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
