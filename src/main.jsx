import React from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import { ThemeProvider } from './theme.jsx'
import Dossier from './Dossier.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <Dossier />
    </ThemeProvider>
  </React.StrictMode>
)
