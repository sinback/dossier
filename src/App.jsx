import { Routes, Route } from 'react-router-dom'
import Dossier from './Dossier.jsx'
import CrinklyDemo from './CrinklyDemo.jsx'
import InkyDemo from './InkyDemo.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dossier />} />
      <Route path="/crinkly" element={<CrinklyDemo />} />
      <Route path="/inky" element={<InkyDemo />} />
    </Routes>
  )
}
