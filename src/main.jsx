import React from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import Dossier from './Dossier.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Dossier />
  </React.StrictMode>
)
