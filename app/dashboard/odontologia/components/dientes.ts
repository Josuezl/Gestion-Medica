// Vista 48 × 64 con las raíces arriba. La arcada inferior usa un espejo vertical.
const siluetas = {
  molar: {
    contorno: 'M9 41 C8 35 7 26 8 15 C9 7 13 5 15 12 L20 29 Q24 34 28 29 L34 12 C37 5 40 9 40 17 C41 27 39 36 39 41 C44 47 43 55 39 59 Q33 63 24 60 Q14 63 9 59 C5 55 4 47 9 41 Z',
    cuello: 'M9 41 Q16 39 24 42 Q32 39 39 41',
    corona: 'M9 41 Q16 39 24 42 Q32 39 39 41 C44 47 43 55 39 59 Q33 63 24 60 Q14 63 9 59 C5 55 4 47 9 41 Z',
    conductos: 'M12 13 Q13 30 20 42 M36 13 Q35 30 28 42',
  },
  premolar: {
    contorno: 'M14 41 C16 33 16 23 19 12 C21 5 23 6 25 16 L27 27 L30 13 C32 8 34 11 34 17 Q35 33 34 41 C39 46 38 53 34 58 Q30 62 24 58 Q18 62 14 58 C10 53 9 46 14 41 Z',
    cuello: 'M14 41 Q24 38 34 41',
    corona: 'M14 41 Q24 38 34 41 C39 46 38 53 34 58 Q30 62 24 58 Q18 62 14 58 C10 53 9 46 14 41 Z',
    conductos: 'M22 13 Q22 29 25 42 M31 16 Q31 29 27 42',
  },
  canino: {
    contorno: 'M16 41 C19 30 18 18 22 8 C24 3 28 6 29 13 Q29 28 32 41 C37 47 35 51 31 55 L25 61 Q24 62 22 60 L16 54 C12 50 12 46 16 41 Z',
    cuello: 'M16 41 Q24 37 32 41',
    corona: 'M16 41 Q24 37 32 41 C37 47 35 51 31 55 L25 61 Q24 62 22 60 L16 54 C12 50 12 46 16 41 Z',
    conductos: 'M25 11 Q23 27 24 43',
  },
  incisivo: {
    contorno: 'M17 41 Q18 31 21 18 C23 10 26 8 28 16 L31 41 Q35 47 34 57 Q33 60 24 59 Q15 60 14 57 Q13 48 17 41 Z',
    cuello: 'M17 41 Q24 38 31 41',
    corona: 'M17 41 Q24 38 31 41 Q35 47 34 57 Q33 60 24 59 Q15 60 14 57 Q13 48 17 41 Z',
    conductos: 'M25 17 Q23 29 24 43',
  },
}

export function siluetaDe(fdi: number) {
  const posicion = fdi % 10
  if (posicion <= 2) return siluetas.incisivo
  if (posicion === 3) return siluetas.canino
  if (fdi < 50 && posicion <= 5) return siluetas.premolar
  return siluetas.molar
}
