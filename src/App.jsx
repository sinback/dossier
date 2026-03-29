import { Routes, Route } from 'react-router-dom'
import Dossier from './Dossier.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dossier />} />
    </Routes>
  )
}
