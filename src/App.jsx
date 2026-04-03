import { Routes, Route } from 'react-router-dom'
import Dossier from './Dossier.jsx'
import CrinklyDemo from './styles/CrinklyDemo.jsx'
import InkyDemo from './styles/InkyDemo.jsx'
import MatlackCanvas from './styles/MatlackCanvas.jsx'
import MatlackReviewGrid from './styles/MatlackReviewGrid.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dossier />} />
      <Route path="/crinkly" element={<CrinklyDemo />} />
      <Route path="/inky" element={<InkyDemo />} />
      <Route path="/matlack" element={<MatlackCanvas />} />
      <Route path="/review" element={<MatlackReviewGrid />} />
    </Routes>
  )
}
