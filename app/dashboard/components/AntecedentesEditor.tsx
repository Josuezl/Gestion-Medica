'use client'

import React, { useId } from 'react'
import { Shield, Stethoscope, PersonStanding, Users, Check, PlusCircle } from 'lucide-react'
import { ANTECEDENTES, estadoEfectivo, textoInicial, type CampoAntecedente, type EstadoAntecedente } from '@/utils/antecedentes'
import type { PatientRow } from '@/utils/clinicalTypes'

const ICONOS: Record<CampoAntecedente, React.ReactNode> = {
  allergies: <Shield size={22} color="#d97706" aria-hidden="true" />,
  pathological_history: <Stethoscope size={22} color="var(--primary)" aria-hidden="true" />,
  non_pathological_history: <PersonStanding size={22} color="var(--primary)" aria-hidden="true" />,
  family_history: <Users size={22} color="var(--primary)" aria-hidden="true" />,
}

const OPCIONES: { valor: EstadoAntecedente; texto: string }[] = [
  { valor: 'sin_registrar', texto: 'Sin registrar' },
  { valor: 'niega', texto: 'Niega' },
  { valor: 'refiere', texto: 'Refiere' },
]

/**
 * Antecedentes con Sin registrar / Niega / Refiere (Nueva Consulta y edición del paciente).
 *
 * Campos NO controlados a propósito, como el resto del formulario de consulta: el borrador local
 * escribe directo en el DOM. Qué se muestra en cada estado lo decide el CSS (:has) en globals.css.
 * Un solo cuadro de texto por antecedente: si el médico cambia de opción, lo escrito se conserva.
 */
export default function AntecedentesEditor({ patient }: { patient: PatientRow }) {
  const id = useId()
  return (
    <div className="ant-grid">
      {ANTECEDENTES.map((def) => {
        const texto = patient[def.campo]
        const estado = estadoEfectivo(patient[`${def.campo}_status`], texto)
        const inicial = textoInicial(estado, texto)
        const base = `${id}-${def.campo}`
        return (
          <fieldset key={def.campo} className="ant-campo">
            <legend className="ant-cabecera">
              {ICONOS[def.campo]}
              <span>
                <span className="ant-titulo">{def.titulo}</span>
                <span className="ant-descripcion">{def.descripcion}</span>
              </span>
            </legend>

            <div className="ant-opciones">
              {OPCIONES.map((op) => (
                <label key={op.valor}>
                  <input
                    type="radio" name={`${def.campo}_status`} value={op.valor} defaultChecked={estado === op.valor}
                    // Al elegir «Refiere» el cursor pasa al detalle.
                    onChange={op.valor === 'refiere'
                      ? (e) => e.currentTarget.closest('.ant-campo')?.querySelector('textarea')?.focus()
                      : undefined}
                  />
                  <Check size={16} className="ant-check" aria-hidden="true" />
                  {op.texto}
                </label>
              ))}
            </div>

            <p className="ant-solo-sin">
              Pendiente de registrar.
              <span>Selecciona una opción después de consultar al paciente.</span>
            </p>
            <p className="ant-solo-niega">{def.niega}</p>
            <label className="ant-solo-niega ant-obs-boton">
              <input type="checkbox" name={`${def.campo}_obs`} className="ant-obs" defaultChecked={estado === 'niega' && !!inicial} />
              <PlusCircle size={18} aria-hidden="true" /> Añadir observación <span className="bp-opcional">(opcional)</span>
            </label>

            <div className="ant-texto">
              <label htmlFor={`${base}-texto`} className="form-label">
                <span className="ant-solo-refiere">{def.detalle} <span className="ant-requerido">*</span></span>
                <span className="ant-solo-niega">Observación</span>
              </label>
              <textarea id={`${base}-texto`} className="form-input" name={def.campo} rows={2} defaultValue={inicial} placeholder={def.placeholder} />
              <span className="ant-ayuda ant-solo-refiere">Completa los detalles para registrar este antecedente.</span>
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
