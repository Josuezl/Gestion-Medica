import React from 'react'
import { formatDateShortHN } from '@/utils/datetime'
import type { VitalsHistoryRow } from '@/utils/historialSignos'

/**
 * Historial de «Otros signos vitales» en Nueva Consulta: mismo formato que el de presión (3 filas
 * visibles, el resto con scroll y encabezado fijo). Perímetro cefálico solo en pediátricos.
 */
export default function VitalsHistoryTable({ rows, pediatrico }: { rows: VitalsHistoryRow[]; pediatrico: boolean }) {
  const celda = (v: string | null) => (v ? <span className="bp-hist-valor">{v}</span> : <span className="bp-hist-vacio">—</span>)
  return (
    <section className="bp-historial" aria-label="Historial de otros signos vitales">
      <div className="bp-historial-cabecera">
        <span className="bp-historial-titulo">Históricos · Otros signos</span>
      </div>
      {rows.length === 0 ? <p className="bp-historial-vacio">Sin registros anteriores.</p> : (
      <div className="bp-historial-scroll">
        <table className="vs-historial-tabla">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Temp. °C</th>
              <th scope="col">Peso kg</th>
              <th scope="col">Talla cm</th>
              {pediatrico && <th scope="col">P. cef. cm</th>}
              <th scope="col">FC lpm</th>
              <th scope="col">FR rpm</th>
              <th scope="col">SpO₂ %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bp-hist-fecha">{formatDateShortHN(r.createdAt)}</td>
                <td>{celda(r.temperatura)}</td>
                <td>{celda(r.peso)}</td>
                <td>{celda(r.talla)}</td>
                {pediatrico && <td>{celda(r.perimetroCefalico)}</td>}
                <td>{celda(r.fc)}</td>
                <td>{celda(r.fr)}</td>
                <td>{celda(r.spo2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}
