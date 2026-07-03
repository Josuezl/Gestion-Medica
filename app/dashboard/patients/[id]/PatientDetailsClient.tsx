'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePatient, updatePatientGender } from '../actions'
import { sendPrescriptionByEmail, sendLabOrderByEmail, sendIncapacidadByEmail, sendReferralByEmail, sendStudyRequestByEmail } from './email-actions'
import { canDoClinical, canEnterVitals } from '@/utils/permissions'
import { doctorShortName } from '@/utils/doctorName'
import { isPediatric } from '@/utils/age'
import { medicineDetail } from '@/utils/medicines'
import { useAppOrigin } from '@/utils/useAppOrigin'
import StudyUploader from '../../components/StudyUploader'
import StudyList from '../../components/StudyList'
import {
  Phone,
  Mail,
  Calendar,
  Activity,
  Beaker,
  AlertCircle,
  FileText,
  FileBadge,
  Loader2,
  Edit,
  ClipboardList,
  FileSpreadsheet,
  Plus,
  Printer,
  Share2,
  Pill,
  ChevronDown,
  ChevronUp,
  Baby,
  Stethoscope,
} from 'lucide-react'
import PediatricGrowthChart from '../../components/PediatricGrowthChart'
import WhatsAppShareModal from '../../components/WhatsAppShareModal'
import PreclinicalVitalsModal from '../../components/PreclinicalVitalsModal'
import LabOrdersTab from './LabOrdersTab'
import StudyRequestsTab from './StudyRequestsTab'
import MedicalLeaveModal from './MedicalLeaveModal'

// Utilidad para calcular edad
function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

// Convierte 'YYYY-MM-DD' a Date en hora LOCAL para evitar el corrimiento de un día que provoca
// `new Date('YYYY-MM-DD')` (se interpreta como UTC y, en zonas como Honduras UTC-6, retrocede al
// día anterior). Los timestamps con hora/zona se dejan al parseo normal.
function parseLocalDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

interface PatientDetailsClientProps {
  patient: any
  consultations: any[]
  studies: any[]
  prescriptions: any[]
  labOrders?: any[]
  studyRequests?: any[]
  medicalLeaves?: any[]
  referrals?: any[]
  showRecordNumber?: boolean
  initialEdit?: boolean
  justCreated?: boolean
  currentUserId: string
  currentUserRole: string
  isOrgAdmin: boolean
}

export default function PatientDetailsClient({
  patient,
  consultations,
  studies,
  prescriptions,
  labOrders = [],
  studyRequests = [],
  medicalLeaves = [],
  referrals = [],
  showRecordNumber = false,
  initialEdit = false,
  justCreated = false,
  currentUserId,
  currentUserRole,
  isOrgAdmin
}: PatientDetailsClientProps) {
  const appUrl = useAppOrigin()
  // Asistente y enfermera solo gestionan datos del paciente y recetas (sin trabajo clínico ni expediente).
  const canClinical = canDoClinical(currentUserRole)
  const canTakeVitals = canEnterVitals(currentUserRole)
  // Última consulta: se usa para iniciar consulta de seguimiento y para emitir/corregir incapacidad.
  const lastConsult: any = consultations && consultations.length > 0 ? consultations[0] : null
  const [activeTab, setActiveTab] = useState<'history' | 'consultations' | 'prescriptions' | 'laborders' | 'studyrequests' | 'incapacidades' | 'referencias' | 'studies' | 'pediatrics'>(canClinical ? 'consultations' : 'prescriptions')
  const [expandedLabOrder, setExpandedLabOrder] = useState<string | null>(null)
  const [expandedStudyRequest, setExpandedStudyRequest] = useState<string | null>(null)
  // Modal de WhatsApp unificado: comparte receta / orden de lab / incapacidad según `docType`.
  const [whatsappShare, setWhatsappShare] = useState<{ doc: any; docType: 'prescription' | 'laborder' | 'incapacidad' | 'referral' | 'studyrequest' } | null>(null)
  const [showVitalsModal, setShowVitalsModal] = useState(false)
  // Modal para emitir/corregir la incapacidad de la última consulta (sin editar lo clínico).
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showCreatedBanner, setShowCreatedBanner] = useState(justCreated)
  const [expandedConsultations, setExpandedConsultations] = useState<Record<string, boolean>>({})
  const toggleConsultation = (id: string) => {
    setExpandedConsultations(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const handleWhatsAppPrescriptionShare = (e: React.MouseEvent<HTMLAnchorElement>, presc: any) => {
    e.preventDefault()
    setWhatsappShare({ doc: presc, docType: 'prescription' })
  }
  const handleWhatsAppLabShare = (order: any) => {
    setWhatsappShare({ doc: order, docType: 'laborder' })
  }
  const handleWhatsAppLeaveShare = (leave: any) => {
    setWhatsappShare({ doc: leave, docType: 'incapacidad' })
  }
  const handleWhatsAppReferralShare = (ref: any) => {
    setWhatsappShare({ doc: ref, docType: 'referral' })
  }
  const handleWhatsAppStudyShare = (order: any) => {
    setWhatsappShare({ doc: order, docType: 'studyrequest' })
  }
  const [expandedPrescription, setExpandedPrescription] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(initialEdit)
  // Derivado de la fecha de nacimiento (menor de 19 años); el servidor lo recalcula al guardar.
  const [isEditPediatric, setIsEditPediatric] = useState(isPediatric(patient.birth_date))
  const [editError, setEditError] = useState<string | null>(null)
  const [editPending, startEditTransition] = useTransition()
  const [isUpdatingGender, startGenderTransition] = useTransition()
  const router = useRouter()


  // Manejar edición de ficha
  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditError(null)
    const formData = new FormData(event.currentTarget)
    
    startEditTransition(async () => {
      const result = await updatePatient(patient.id, formData)
      if (result.error) {
        setEditError(result.error)
      } else {
        setIsEditing(false)
        router.refresh()
      }
    })
  }

  // Manejar carga de archivos
  const printMedicalRecord = () => {

    const formatDate = (dateStr: string) => {
      if (!dateStr) return 'N/A';
      return parseLocalDate(dateStr).toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const consultationsHtml = consultations.length === 0
      ? `<p style="color:#888;font-style:italic;">No hay consultas registradas.</p>`
      : consultations.map((c: any, index: number) => {
          const docName = doctorShortName(c.user_profiles?.first_name, c.user_profiles?.last_name, c.user_profiles?.gender);
          const consultDate = formatDate(c.created_at);

          const vitalsHtml = [
            c.blood_pressure ? `<span class="vital-tag">PA: ${c.blood_pressure}</span>` : '',
            c.temperature ? `<span class="vital-tag">Temp: ${c.temperature}°C</span>` : '',
            c.weight ? `<span class="vital-tag">Peso: ${c.weight} kg</span>` : '',
            c.heart_rate ? `<span class="vital-tag">FC: ${c.heart_rate} bpm</span>` : '',
            c.respiratory_rate ? `<span class="vital-tag">FR: ${c.respiratory_rate} rpm</span>` : '',
            c.oxygen_saturation ? `<span class="vital-tag">SpO2: ${c.oxygen_saturation}%</span>` : '',
          ].filter(Boolean).join('');

          const medsHtml = (c.prescriptions && c.prescriptions.length > 0 && c.prescriptions[0].medicines && c.prescriptions[0].medicines.length > 0)
            ? `<table class="med-table">
                <thead><tr><th>#</th><th>Medicamento</th></tr></thead>
                <tbody>
                  ${c.prescriptions[0].medicines.map((m: any, i: number) => {
                    const det = medicineDetail(m)
                    return `<tr>
                      <td>${i + 1}</td>
                      <td><strong>${m.name || ''}</strong>${det ? ` — ${det}` : ''}</td>
                    </tr>`
                  }).join('')}
                </tbody>
              </table>`
            : `<p class="empty-note">Sin medicamentos recetados en esta consulta.</p>`;

          return `
            <div class="consult-card ${index > 0 ? 'page-break-before' : ''}">
              <div class="consult-header">
                <div>
                  <div class="consult-date">${consultDate}</div>
                  <div class="consult-doctor">${docName}</div>
                </div>
                ${vitalsHtml ? `<div class="vitals">${vitalsHtml}</div>` : ''}
              </div>

              <div class="consult-grid">
                <div class="field-card diagnosis-card">
                  <div class="field-label">Diagnóstico Principal</div>
                  <div class="field-value diagnosis-value">${c.diagnosis || '—'}</div>
                </div>
              </div>

              <div class="consult-grid two-col">
                <div class="field-card">
                  <div class="field-label">Motivo de Consulta</div>
                  <div class="field-value">${c.reason_for_visit || '—'}</div>
                </div>
                <div class="field-card">
                  <div class="field-label">Síntomas / Anamnesis</div>
                  <div class="field-value">${c.symptoms || 'Ninguno reportado'}</div>
                </div>
              </div>

              <div class="consult-grid two-col">
                <div class="field-card">
                  <div class="field-label">Exámenes de laboratorio / estudios médicos</div>
                  <div class="field-value">${c.physical_exam || 'Ninguno registrado'}</div>
                </div>
                <div class="field-card">
                  <div class="field-label">Plan de Tratamiento</div>
                  <div class="field-value">${c.treatment_plan || '—'}</div>
                </div>
              </div>

              <div class="field-card" style="margin-top:12px;">
                <div class="field-label" style="color:#0d9488;">Tratamiento Farmacológico</div>
                ${medsHtml}
              </div>
            </div>
          `;
        }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Expediente Clínico — ${patient.first_name} ${patient.last_name}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              color: #1e293b;
              background: #fff;
              padding: 0;
            }

            /* ---- Cover header ---- */
            .report-header {
              background-color: #0d9488 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              color: #ffffff !important;
              padding: 32px 40px;
            }
            .report-header h1 {
              font-size: 22px;
              font-weight: 800;
              letter-spacing: -0.5px;
              color: #ffffff !important;
            }
            .report-header .subtitle {
              font-size: 13px;
              color: rgba(255,255,255,0.88) !important;
              margin-top: 4px;
            }
            .report-header .print-date {
              font-size: 12px;
              color: rgba(255,255,255,0.72) !important;
              margin-top: 12px;
            }

            /* ---- Main content ---- */
            .report-body { padding: 32px 40px; }

            /* ---- Section titles ---- */
            .section-title {
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 13px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #0d9488;
              margin-bottom: 14px;
              padding-bottom: 8px;
              border-bottom: 2px solid #ccfbf1;
            }

            /* ---- Patient info grid ---- */
            .info-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 14px;
              margin-bottom: 14px;
            }
            .info-field label {
              display: block;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #64748b;
              margin-bottom: 3px;
            }
            .info-field span {
              font-size: 14px;
              font-weight: 600;
              color: #0f172a;
            }

            /* ---- Allergy box ---- */
            .allergy-box {
              background: #fff7ed;
              border: 1px solid #fed7aa;
              border-left: 4px solid #f97316;
              border-radius: 8px;
              padding: 14px 18px;
              margin-bottom: 18px;
            }
            .allergy-box label {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #c2410c;
            }
            .allergy-box span {
              display: block;
              font-size: 14px;
              font-weight: 700;
              color: #9a3412;
              margin-top: 4px;
            }

            /* ---- Background section ---- */
            .bg-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 14px;
              margin-bottom: 28px;
            }
            .bg-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 16px;
            }
            .bg-card label {
              display: block;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #64748b;
              margin-bottom: 5px;
            }
            .bg-card p {
              font-size: 13px;
              color: #1e293b;
              line-height: 1.5;
              white-space: pre-line;
            }

            /* ---- Consultation cards ---- */
            .consult-card {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 20px;
              margin-bottom: 22px;
              background: #fff;
            }
            .page-break-before {
              page-break-before: always;
            }
            .consult-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 16px;
              padding-bottom: 14px;
              border-bottom: 1px solid #e2e8f0;
            }
            .consult-date {
              font-size: 15px;
              font-weight: 800;
              color: #0d9488;
            }
            .consult-doctor {
              font-size: 12px;
              color: #64748b;
              margin-top: 2px;
            }
            .vitals {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              justify-content: flex-end;
            }
            .vital-tag {
              background: #f0fdfa;
              border: 1px solid #99f6e4;
              border-radius: 20px;
              padding: 3px 10px;
              font-size: 11px;
              font-weight: 600;
              color: #0f766e;
            }

            /* ---- Field cards ---- */
            .consult-grid { margin-bottom: 12px; }
            .consult-grid.two-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .field-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 14px;
            }
            .diagnosis-card {
              background: rgba(13,148,136,0.04);
              border: 1px solid rgba(13,148,136,0.22);
              border-left: 4px solid #0d9488;
            }
            .field-label {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #64748b;
              margin-bottom: 5px;
            }
            .diagnosis-card .field-label { color: #0d9488; }
            .field-value {
              font-size: 13px;
              color: #1e293b;
              line-height: 1.55;
              white-space: pre-line;
            }
            .diagnosis-value {
              font-size: 15px;
              font-weight: 700;
              color: #0f172a;
            }

            /* ---- Medicines table ---- */
            .med-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 12px;
            }
            .med-table th {
              background: #f1f5f9;
              text-align: left;
              padding: 6px 10px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #475569;
              border-bottom: 1px solid #e2e8f0;
            }
            .med-table td {
              padding: 7px 10px;
              border-bottom: 1px solid #f1f5f9;
              color: #334155;
            }
            .med-table tr:last-child td { border-bottom: none; }
            .empty-note {
              font-size: 12px;
              color: #94a3b8;
              font-style: italic;
              margin-top: 6px;
            }

            /* ---- Divider ---- */
            .divider {
              height: 1px;
              background: #e2e8f0;
              margin: 28px 0;
            }

            /* ---- Footer ---- */
            .report-footer {
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              padding: 20px 40px;
              border-top: 1px solid #e2e8f0;
              margin-top: 10px;
            }

            /* ---- Print bar ---- */
            .print-bar {
              position: sticky;
              top: 0;
              z-index: 100;
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: #1e293b;
              padding: 12px 24px;
              color: #fff;
            }
            .print-bar span {
              font-size: 13px;
              color: #94a3b8;
            }
            .print-bar button {
              background: #0d9488;
              color: #fff;
              border: none;
              border-radius: 8px;
              padding: 9px 22px;
              font-size: 14px;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .print-bar button:hover { background: #0f766e; }

            @media print {
              body { padding: 0; }
              .print-bar { display: none !important; }
              .report-body { padding: 24px 32px; }
              .report-header { padding: 24px 32px; }
              .consult-card { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <!-- ===== PRINT BAR ===== -->
          <div class="print-bar">
            <span>Vista previa · Expediente Clínico — ${patient.first_name} ${patient.last_name}</span>
            <button onclick="window.print()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Imprimir / Guardar PDF
            </button>
          </div>
          <!-- ===== HEADER ===== -->
          <div class="report-header" style="background-color:#0d9488;color:#ffffff;padding:32px 40px;">
            <h1 style="font-size:22px;font-weight:800;color:#ffffff;margin:0;">Expediente Clínico</h1>
            <div class="subtitle" style="font-size:13px;color:rgba(255,255,255,0.88);margin-top:6px;">${patient.first_name} ${patient.last_name}</div>
            <div class="print-date" style="font-size:12px;color:rgba(255,255,255,0.72);margin-top:10px;">Generado el ${new Date().toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>

          <div class="report-body">
            <!-- ===== DATOS PERSONALES ===== -->
            <div class="section-title">Datos Personales</div>

            <div class="info-grid">
              <div class="info-field"><label>Nombre completo</label><span>${patient.first_name} ${patient.last_name}</span></div>
              <div class="info-field"><label>Identidad (DNI)</label><span>${patient.id_card || 'N/A'}</span></div>
              <div class="info-field"><label>Fecha de nacimiento</label><span>${formatDate(patient.birth_date)}</span></div>
              <div class="info-field"><label>Edad</label><span>${calculateAge(patient.birth_date)} años</span></div>
              <div class="info-field"><label>Sexo</label><span>${patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : 'Otro'}</span></div>
              <div class="info-field"><label>Tipo de sangre</label><span>${patient.blood_type || 'N/A'}</span></div>
              <div class="info-field"><label>Teléfono</label><span>${patient.phone || 'N/A'}</span></div>
              <div class="info-field"><label>Correo electrónico</label><span>${patient.email || 'N/A'}</span></div>
              <div class="info-field"><label>Dirección</label><span>${patient.address || 'N/A'}</span></div>
            </div>

            <!-- ===== ALERGIAS ===== -->
            <div class="allergy-box">
              <label>⚠ Alergias conocidas</label>
              <span>${patient.allergies || 'Ninguna conocida'}</span>
            </div>

            <!-- ===== ANTECEDENTES ===== -->
            <div class="section-title">Antecedentes Médicos</div>
            <div class="bg-grid">
              <div class="bg-card">
                <label>Patológicos</label>
                <p>${patient.pathological_history || 'No declarados'}</p>
              </div>
              <div class="bg-card">
                <label>No Patológicos</label>
                <p>${patient.non_pathological_history || 'No declarados'}</p>
              </div>
              <div class="bg-card">
                <label>Heredofamiliares</label>
                <p>${patient.family_history || 'No declarados'}</p>
              </div>
            </div>

            <div class="divider"></div>

            <!-- ===== HISTORIAL DE CONSULTAS ===== -->
            <div class="section-title">
              Historial de Consultas
              <span style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:none;letter-spacing:0;">(${consultations.length} registro${consultations.length !== 1 ? 's' : ''})</span>
            </div>

            ${consultationsHtml}

          </div>

          <!-- ===== FOOTER ===== -->
          <div class="report-footer">
            Expediente Clínico · ${patient.first_name} ${patient.last_name} · Confidencial — solo para uso médico
          </div>
        </body>
      </html>
    `;
    // Abrir en una pestaña completamente independiente usando Blob URL
    // (evita que la app principal se bloquee cuando el diálogo de impresión está abierto)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // Liberar el objeto URL después de un segundo
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Estados para envío de correo
  const [sendingPrescEmail, setSendingPrescEmail] = useState<string | null>(null)
  const [prescEmailMsg, setPrescEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)
  const [sendingLabEmail, setSendingLabEmail] = useState<string | null>(null)
  const [labEmailMsg, setLabEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)
  const [sendingStudyEmail, setSendingStudyEmail] = useState<string | null>(null)
  const [studyEmailMsg, setStudyEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)
  const [sendingLeaveEmail, setSendingLeaveEmail] = useState<string | null>(null)
  const [leaveEmailMsg, setLeaveEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)
  const [sendingReferralEmail, setSendingReferralEmail] = useState<string | null>(null)
  const [referralEmailMsg, setReferralEmailMsg] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)

  const handleSendPrescriptionEmail = async (prescriptionId: string) => {
    setSendingPrescEmail(prescriptionId)
    setPrescEmailMsg(null)
    try {
      const result = await sendPrescriptionByEmail(patient.id, prescriptionId)
      if (result.error) {
        setPrescEmailMsg({ type: 'error', text: result.error, id: prescriptionId })
      } else {
        setPrescEmailMsg({ type: 'success', text: `✅ Receta enviada a ${patient.email}`, id: prescriptionId })
        setTimeout(() => setPrescEmailMsg(null), 5000)
      }
    } catch {
      setPrescEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: prescriptionId })
    }
    setSendingPrescEmail(null)
  }

  const handleSendLabEmail = async (labOrderId: string) => {
    setSendingLabEmail(labOrderId)
    setLabEmailMsg(null)
    try {
      const result = await sendLabOrderByEmail(patient.id, labOrderId)
      if (result.error) {
        setLabEmailMsg({ type: 'error', text: result.error, id: labOrderId })
      } else {
        setLabEmailMsg({ type: 'success', text: `✅ Orden enviada a ${patient.email}`, id: labOrderId })
        setTimeout(() => setLabEmailMsg(null), 5000)
      }
    } catch {
      setLabEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: labOrderId })
    }
    setSendingLabEmail(null)
  }

  const handleSendStudyEmail = async (studyRequestId: string) => {
    setSendingStudyEmail(studyRequestId)
    setStudyEmailMsg(null)
    try {
      const result = await sendStudyRequestByEmail(patient.id, studyRequestId)
      if (result.error) {
        setStudyEmailMsg({ type: 'error', text: result.error, id: studyRequestId })
      } else {
        setStudyEmailMsg({ type: 'success', text: `✅ Solicitud enviada a ${patient.email}`, id: studyRequestId })
        setTimeout(() => setStudyEmailMsg(null), 5000)
      }
    } catch {
      setStudyEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: studyRequestId })
    }
    setSendingStudyEmail(null)
  }

  const handleSendIncapacidadEmail = async (consultationId: string) => {
    setSendingLeaveEmail(consultationId)
    setLeaveEmailMsg(null)
    try {
      const result = await sendIncapacidadByEmail(patient.id, consultationId)
      if (result.error) {
        setLeaveEmailMsg({ type: 'error', text: result.error, id: consultationId })
      } else {
        setLeaveEmailMsg({ type: 'success', text: `✅ Incapacidad enviada a ${patient.email}`, id: consultationId })
        setTimeout(() => setLeaveEmailMsg(null), 5000)
      }
    } catch {
      setLeaveEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: consultationId })
    }
    setSendingLeaveEmail(null)
  }

  const handleSendReferralEmail = async (consultationId: string) => {
    setSendingReferralEmail(consultationId)
    setReferralEmailMsg(null)
    try {
      const result = await sendReferralByEmail(patient.id, consultationId)
      if (result.error) {
        setReferralEmailMsg({ type: 'error', text: result.error, id: consultationId })
      } else {
        setReferralEmailMsg({ type: 'success', text: `✅ Referencia enviada a ${patient.email}`, id: consultationId })
        setTimeout(() => setReferralEmailMsg(null), 5000)
      }
    } catch {
      setReferralEmailMsg({ type: 'error', text: 'Error de conexión al enviar correo.', id: consultationId })
    }
    setSendingReferralEmail(null)
  }

  return (
    <div style={styles.container}>
      {/* Modal tras registrar: ofrece agendar cita (llama más la atención que un banner). */}
      {showCreatedBanner && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '1.75rem', maxWidth: '440px', width: '100%', boxShadow: '0 20px 50px rgba(15,23,42,0.3)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#0f172a' }}>✅ Paciente registrado</h3>
            <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.55, margin: '0 0 1.5rem' }}>
              <strong>{patient.first_name} {patient.last_name}</strong> se registró correctamente. ¿Quieres agendarle una cita ahora?
              {(!patient.phone || String(patient.phone).trim() === '') && (
                <span style={{ display: 'block', marginTop: '0.6rem', color: '#92400e', fontSize: '0.85rem' }}>
                  ⚠️ No se registró teléfono — puedes agregarlo con “Editar Paciente”.
                </span>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <a href={`/dashboard?patientId=${patient.id}&nuevaCita=1`} className="btn btn-primary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                <Calendar size={16} /> Sí, agendar cita
              </a>
              <button type="button" onClick={() => setShowCreatedBanner(false)} className="btn btn-secondary" style={{ width: '100%' }}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Patient Profile Header Card */}
      <div className="card-glass" style={styles.headerCard}>
        <div style={styles.headerLayout}>
          <div style={styles.avatar}>
            {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
          </div>

          <div style={styles.profileDetails}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h2 style={styles.patientName}>{patient.first_name} {patient.last_name}</h2>
              {patient.blood_type && (
                <span className="badge badge-danger" style={{ fontWeight: '800' }}>
                  Grupo: {patient.blood_type}
                </span>
              )}
            </div>
            
            <p style={{ ...styles.demographicsSub, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {patient.dob_status === 'unknown' ? (
                <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ Fecha de nacimiento por confirmar</span>
              ) : (
                <>{calculateAge(patient.birth_date)} años{patient.dob_status === 'estimated' ? ' (estimada)' : ''} • Nacido el {parseLocalDate(patient.birth_date).toLocaleDateString('es-HN')}</>
              )} •
              Género:
              <select
                value={patient.gender || ''}
                disabled={isUpdatingGender}
                onChange={(e) => {
                  startGenderTransition(async () => {
                    await updatePatientGender(patient.id, e.target.value)
                  })
                }}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  backgroundColor: patient.gender === 'F' ? '#fdf2f8' : patient.gender === 'M' ? '#eff6ff' : '#f8fafc',
                  color: patient.gender === 'F' ? '#be185d' : patient.gender === 'M' ? '#1d4ed8' : '#475569',
                  border: `1px solid ${patient.gender === 'F' ? '#fbcfe8' : patient.gender === 'M' ? '#bfdbfe' : '#e2e8f0'}`,
                  borderRadius: '999px',
                  padding: '0.2rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  outline: 'none',
                  opacity: isUpdatingGender ? 0.6 : 1
                }}
              >
                <option value="">Sin especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                {patient.gender === 'O' && <option value="O">Otro</option>}
              </select>
            </p>

            <div style={styles.contactRow}>
              <span style={styles.contactItem}>
                <Phone size={14} />
                <span>{patient.phone ? patient.phone : <em style={{ color: 'var(--text-muted)' }}>Sin teléfono</em>}</span>
              </span>
              {patient.email ? (
                <span style={styles.contactItem}>
                  <Mail size={14} />
                  <span>{patient.email}</span>
                </span>
              ) : null}
              {patient.id_card ? (
                <span style={styles.contactItem}>
                  <span>DNI: {patient.id_card}</span>
                </span>
              ) : null}
              {showRecordNumber && patient.record_number ? (
                <span style={styles.contactItem}>
                  <span>Exp: {patient.record_number}</span>
                </span>
              ) : null}
            </div>
          </div>

          </div>

          {/* Acciones del expediente: fila propia (debajo de los datos) para que el nombre quepa en
              una sola línea. En móvil (.action-row ≤480px) los botones se apilan a todo el ancho. */}
          <div className="action-row" style={{ ...styles.headerActions, marginTop: '1.25rem' }}>
            <button className="btn btn-secondary" style={{ gap: '0.4rem' }} onClick={() => setIsEditing(!isEditing)}>
              <Edit size={16} />
              {isEditing ? 'Cancelar' : 'Editar Paciente'}
            </button>
            {canTakeVitals && (
              <button
                type="button"
                onClick={() => setShowVitalsModal(true)}
                className="btn btn-secondary"
                style={{ gap: '0.4rem' }}
                title="Tomar signos vitales (pre-clínica)"
              >
                <Stethoscope size={16} />
                Tomar Signos
              </button>
            )}
            <button onClick={printMedicalRecord} className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none' }}>
              <Printer size={16} />
              Imprimir Ficha
            </button>
            {prescriptions.length > 0 && (
              <a href={`/prescriptions/${prescriptions[0].id}/print`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', textDecoration: 'none' }} title="Imprimir la última receta emitida">
                <Printer size={16} />
                Última Receta
              </a>
            )}
            {labOrders.length > 0 && (
              <a href={`/lab-orders/${labOrders[0].id}/print`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', textDecoration: 'none' }} title="Imprimir la última orden de laboratorio">
                <Printer size={16} />
                Última Orden de Lab
              </a>
            )}
            {studyRequests.length > 0 && (
              <a href={`/study-requests/${studyRequests[0].id}/print`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', textDecoration: 'none' }} title="Imprimir la última solicitud de estudios">
                <Printer size={16} />
                Última Solicitud de Estudio
              </a>
            )}
            {medicalLeaves.length > 0 && (
              <a href={`/consultations/${medicalLeaves[0].id}/print`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ gap: '0.4rem', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', textDecoration: 'none' }} title="Imprimir la última incapacidad médica">
                <Printer size={16} />
                Última Incapacidad
              </a>
            )}
            {canClinical && lastConsult && (
              <button
                type="button"
                onClick={() => setShowLeaveModal(true)}
                className="btn"
                style={{
                  gap: '0.4rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
                }}
                title="Emitir una incapacidad sobre la última consulta"
              >
                <Plus size={16} />
                <FileText size={16} />
                Nueva Incapacidad
              </button>
            )}
            {canClinical && (
              <a
                href={`/dashboard/consultations/new?patientId=${patient.id}`}
                className="btn btn-primary"
                style={{ gap: '0.4rem' }}
              >
                <Plus size={16} />
                Nueva Consulta
              </a>
            )}
          </div>

        {/* Critical Allergies Ribbon */}
        <div style={styles.allergiesRibbon}>
          <AlertCircle size={16} color="#ef4444" />
          <span style={styles.allergiesLabel}>Alergias:</span>
          <span style={styles.allergiesValue}>{patient.allergies || 'Ninguna conocida'}</span>
        </div>

      </div>

      {/* Edit Mode Panel */}
      {isEditing && (
        <div className="card" style={styles.editCard}>
          <h3 style={styles.sectionTitle}>Editar Información del Paciente</h3>
          {editError && <div className="badge badge-danger" style={{ margin: '1rem 0', width: '100%', padding: '0.5rem' }}>{editError}</div>}
          <form onSubmit={handleEditSubmit}>
            <div style={styles.formGrid}>
              <div className="form-group">
                <label className="form-label">Nombre(s) *</label>
                <input className="form-input" name="first_name" defaultValue={patient.first_name} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellido(s) *</label>
                <input className="form-input" name="last_name" defaultValue={patient.last_name} required />
              </div>
              <div className="form-group">
                <label className="form-label">Identidad (DNI)</label>
                <input className="form-input" name="id_card" defaultValue={patient.id_card} />
              </div>
              {showRecordNumber && (
                <div className="form-group">
                  <label className="form-label">N° de Expediente</label>
                  <input className="form-input" name="record_number" defaultValue={patient.record_number || ''} placeholder="Opcional" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Fecha de Nacimiento *</label>
                <input className="form-input" type="date" name="birth_date" defaultValue={patient.birth_date} onChange={(e) => setIsEditPediatric(isPediatric(e.target.value))} required />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp (Honduras)</label>
                <input className="form-input" name="phone" defaultValue={(patient.phone || '').replace('+504', '')} placeholder="9988-7766" />
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input className="form-input" type="email" name="email" defaultValue={patient.email} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Dirección</label>
                <input className="form-input" name="address" defaultValue={patient.address || ''} placeholder="Barrio/Colonia, ciudad" />
              </div>
              <div className="form-group">
                <label className="form-label">Género</label>
                <select className="form-input" name="gender" defaultValue={patient.gender || ''}>
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  {patient.gender === 'O' && <option value="O">Otro</option>}
                </select>
              </div>
              {canClinical && (
                <div className="form-group">
                  <label className="form-label">Tipo de Sangre</label>
                  <select className="form-input" name="blood_type" defaultValue={patient.blood_type || ''}>
                    <option value="">Sin especificar</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <Activity size={16} color={isEditPediatric ? '#0d9488' : 'var(--text-muted)'} />
                  Paciente pediátrico (menor de 19 años):{' '}
                  <strong style={{ color: isEditPediatric ? '#0d9488' : 'var(--text-muted)' }}>{isEditPediatric ? 'Sí' : 'No'}</strong>
                  <span style={{ fontSize: '0.8rem' }}>— se determina por la fecha de nacimiento.</span>
                </div>
              </div>

              {isEditPediatric && (
                <>
                  <div className="form-group">
                    <label className="form-label">Nombre del Padre</label>
                    <input className="form-input" name="father_name" defaultValue={patient.father_name} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre de la Madre</label>
                    <input className="form-input" name="mother_name" defaultValue={patient.mother_name} />
                  </div>
                </>
              )}
            </div>

            {/* Datos clínicos: solo personal clínico (médico/admin). Asistente y enfermera editan
                únicamente datos personales (no ven ni modifican el expediente). */}
            {canClinical && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ color: '#ef4444' }}>Alergias</label>
                  <textarea className="form-input" name="allergies" defaultValue={patient.allergies} rows={2} style={{ borderLeft: '3px solid #ef4444' }} />
                </div>

                <div style={styles.formGrid}>
                  <div className="form-group">
                    <label className="form-label">Antecedentes Patológicos</label>
                    <textarea className="form-input" name="pathological_history" defaultValue={patient.pathological_history} rows={3} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Antecedentes No Patológicos</label>
                    <textarea className="form-input" name="non_pathological_history" defaultValue={patient.non_pathological_history} rows={3} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Antecedentes Heredofamiliares</label>
                  <textarea className="form-input" name="family_history" defaultValue={patient.family_history} rows={3} />
                </div>
              </>
            )}

            <div style={styles.editActions}>
              <button type="submit" className="btn btn-primary" disabled={editPending}>
                {editPending ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Expdediente Section - Tabs */}
      <div style={styles.expedienteContent}>
        {/* Navigation Tabs */}
        <div style={styles.tabsRow}>
          {canClinical && (
            <button
              style={activeTab === 'consultations' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('consultations')}
            >
              <Activity size={18} />
              <span>Consultas (Evolución)</span>
            </button>
          )}

          {canClinical && (
            <button
              style={activeTab === 'history' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('history')}
            >
              <ClipboardList size={18} />
              <span>Antecedentes</span>
            </button>
          )}

          {canClinical && patient.is_pediatric && (
            <button
              style={activeTab === 'pediatrics' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('pediatrics')}
            >
              <Baby size={18} />
              <span>Curvas de Crecimiento OMS</span>
            </button>
          )}

          <button
            style={activeTab === 'prescriptions' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('prescriptions')}
          >
            <FileText size={18} />
            <span>Recetas Emitidas</span>
          </button>

          <button
            style={activeTab === 'laborders' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('laborders')}
          >
            <Beaker size={18} />
            <span>Lab. Solicitados</span>
          </button>

          <button
            style={activeTab === 'studyrequests' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('studyrequests')}
          >
            <Stethoscope size={18} />
            <span>Estudios Solicitados</span>
          </button>

          {/* Incapacidades al final de las pestañas */}
          <button
            style={activeTab === 'incapacidades' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('incapacidades')}
          >
            <FileBadge size={18} />
            <span>Incapacidades</span>
          </button>

          <button
            style={activeTab === 'referencias' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('referencias')}
          >
            <Share2 size={18} />
            <span>Referencias</span>
          </button>

          {/* Estudios Médicos (archivos subidos) al final */}
          {canClinical && (
            <button
              style={activeTab === 'studies' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('studies')}
            >
              <FileSpreadsheet size={18} />
              <span>Estudios Médicos</span>
            </button>
          )}
        </div>

        {/* Tab Contents */}
        <div style={styles.tabContentContainer}>
          {/* TAB 1: CONSULTAS */}
          {activeTab === 'consultations' && (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Historial de Consultas de Evolución</h3>
                <span className="badge badge-info">{consultations.length} Consultas</span>
              </div>

              {consultations.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <Activity size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>Este paciente aún no tiene ninguna consulta clínica registrada.</p>
                  <a href={`/dashboard/consultations/new?patientId=${patient.id}`} className="btn btn-primary" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
                    Registrar Primer Consulta
                  </a>
                </div>
              ) : (
                <div style={styles.timeline}>
                  {consultations.map((consult) => {
                    const date = new Date(consult.created_at).toLocaleDateString('es-HN', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                    const docName = doctorShortName(consult.user_profiles?.first_name, consult.user_profiles?.last_name, consult.user_profiles?.gender)
                    const isExpanded = !!expandedConsultations[consult.id]
                    
                    return (
                      <div key={consult.id} style={styles.timelineItem}>
                        <div style={styles.timelineBadge}></div>
                        <div 
                          className="card" 
                          style={{
                            ...styles.timelineCard,
                            cursor: 'pointer',
                            padding: isExpanded ? '1.5rem' : '1rem 1.5rem',
                            transition: 'all 0.2s ease-in-out'
                          }}
                          onClick={() => toggleConsultation(consult.id)}
                        >
                          <div style={{
                            ...styles.timelineCardHeader,
                            borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                            paddingBottom: isExpanded ? '0.75rem' : '0',
                            marginBottom: isExpanded ? '1rem' : '0',
                            alignItems: 'center'
                          }}>
                            <div>
                              <p style={styles.consultDate}>{date}</p>
                              <p style={styles.consultDoctor}>{docName}</p>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                              {/* Signos Vitales Badge */}
                              <div style={styles.vitalsRow}>
                                {consult.blood_pressure && <span style={styles.vitalTag}>PA: {consult.blood_pressure}</span>}
                                {consult.temperature && <span style={styles.vitalTag}>T°: {consult.temperature}°C</span>}
                                {consult.weight && <span style={styles.vitalTag}>Peso: {consult.weight}kg</span>}
                                {consult.heart_rate && <span style={styles.vitalTag}>FC: {consult.heart_rate}bpm</span>}
                                {consult.respiratory_rate && <span style={styles.vitalTag}>FR: {consult.respiratory_rate}rpm</span>}
                                {consult.oxygen_saturation && <span style={styles.vitalTag}>SpO2: {consult.oxygen_saturation}%</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              {/* Diagnóstico Principal (Ancho Completo) */}
                              <div style={{
                                backgroundColor: 'rgba(13, 148, 136, 0.04)',
                                border: '1px solid rgba(13, 148, 136, 0.2)',
                                borderLeft: '4px solid var(--primary)',
                                borderRadius: '8px',
                                padding: '12px 16px',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'var(--primary)' }}>
                                  <Activity size={14} color="var(--primary)" />
                                  <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diagnóstico Principal</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '700' }}>{consult.diagnosis}</p>
                              </div>

                              {/* Grid de Motivo y Síntomas */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '1rem'
                              }}>
                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <ClipboardList size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo de Consulta</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500' }}>{consult.reason_for_visit}</p>
                                </div>

                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <Activity size={14} color="#3b82f6" />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Síntomas</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500' }}>{consult.symptoms || 'Ninguno reportado'}</p>
                                </div>
                              </div>

                              {/* Grid de Estudios y Plan de Tratamiento */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '1rem'
                              }}>
                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <Beaker size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exámenes de laboratorio/ estudios médicos</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500', whiteSpace: 'pre-line' }}>{consult.physical_exam || 'Ninguno registrado'}</p>
                                </div>

                                <div style={{
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '12px 16px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#64748b' }}>
                                    <FileText size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan de Tratamiento</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', lineHeight: '1.5', fontWeight: '500', whiteSpace: 'pre-line' }}>{consult.treatment_plan}</p>
                                </div>
                              </div>

                              {/* Medicamentos recetados en esta consulta */}
                              {consult.prescriptions && consult.prescriptions.length > 0 && (
                                <div style={{
                                  marginTop: '0.5rem',
                                  padding: '1.25rem',
                                  backgroundColor: 'rgba(13, 148, 136, 0.04)',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(13, 148, 136, 0.12)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <Pill size={16} color="var(--primary)" />
                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tratamiento Farmacológico ({consult.prescriptions[0].verification_code})</span>
                                  </div>
                                  
                                  <div className="scroll-x">
                                   <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '480px', maxWidth: '720px' }}>
                                    {/* Cabecera de la tabla de medicamentos */}
                                    <div style={{
                                      display: 'flex',
                                      gap: '0.75rem',
                                      padding: '0.5rem 0.6rem',
                                      backgroundColor: 'rgba(148, 163, 184, 0.08)',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      color: '#475569',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      border: '1px solid #e2e8f0',
                                    }}>
                                      <span style={{ width: '24px', flexShrink: 0 }}>#</span>
                                      <span style={{ flex: 1 }}>Medicamento</span>
                                    </div>

                                    {(consult.prescriptions[0].medicines || []).map((med: any, idx: number) => (
                                      <div key={idx} style={{
                                        display: 'flex',
                                        gap: '0.75rem',
                                        padding: '0.5rem 0.6rem',
                                        backgroundColor: 'var(--bg-card)',
                                        borderRadius: '6px',
                                        fontSize: '0.82rem',
                                        alignItems: 'center',
                                        border: '1px solid var(--border-color)',
                                      }}>
                                        <span style={{ fontWeight: '700', color: 'var(--text-main)', width: '24px', flexShrink: 0 }}>{idx + 1}</span>
                                        <span style={{ flex: 1, color: 'var(--text-main)' }}><strong>{med.name}</strong>{medicineDetail(med) && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — {medicineDetail(med)}</span>}</span>
                                      </div>
                                    ))}
                                   </div>
                                  </div>
                                  {consult.prescriptions[0].notes && (
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem', fontStyle: 'italic', paddingLeft: '4px' }}>
                                      📝 Notas: {consult.prescriptions[0].notes}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ANTECEDENTES */}
          {activeTab === 'history' && (
            <div style={styles.tabView}>
              <h3 style={styles.tabTitle}>Antecedentes Clínicos del Paciente</h3>
              <div style={styles.formGrid} className="grid-2">
                <div className="card" style={styles.historyBlock}>
                  <h4 style={styles.historyBlockTitle}>Patológicos (Enfermedades y Cirugías)</h4>
                  <p style={styles.historyBlockText}>{patient.pathological_history || 'No declarados'}</p>
                </div>

                <div className="card" style={styles.historyBlock}>
                  <h4 style={styles.historyBlockTitle}>No Patológicos (Hábitos y Vacunas)</h4>
                  <p style={styles.historyBlockText}>{patient.non_pathological_history || 'No declarados'}</p>
                </div>
              </div>

              <div className="card" style={{ ...styles.historyBlock, marginTop: '1.5rem' }}>
                <h4 style={styles.historyBlockTitle}>Antecedentes Heredofamiliares</h4>
                <p style={styles.historyBlockText}>{patient.family_history || 'No declarados'}</p>
              </div>
            </div>
          )}

          {/* TAB 3: RECETAS */}
          {activeTab === 'prescriptions' && (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Historial de Recetas Generadas</h3>
                <span className="badge badge-info">{prescriptions.length} Recetas</span>
              </div>

              {prescriptions.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <FileText size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>No se han emitido recetas médicas para este paciente aún.</p>
                </div>
              ) : (
                <div style={styles.studiesList}>
                  {prescriptions.map((presc) => {
                    const date = new Date(presc.created_at).toLocaleDateString('es-HN')
                    const docName = doctorShortName(presc.user_profiles?.first_name, presc.user_profiles?.last_name, presc.user_profiles?.gender)
                    const isExpanded = expandedPrescription === presc.id
                    
                    return (
                      <div key={presc.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                        {/* Header Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div 
                            style={{ ...styles.studyInfo, cursor: 'pointer', flex: 1 }} 
                            onClick={() => setExpandedPrescription(isExpanded ? null : presc.id)}
                          >
                            <FileText size={22} color="var(--primary)" />
                            <div style={{ flex: 1 }}>
                              <p style={styles.studyNameText}>Receta Médica - Código: {presc.verification_code}</p>
                              <p style={styles.studyMeta}>Emitida el {date} por {docName}</p>
                            </div>
                            {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                          </div>
                          <div style={styles.studyActions}>
                            <a 
                              href={`/prescriptions/${presc.id}/print`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                              title="Imprimir Receta"
                            >
                              <Printer size={14} />
                            </a>
                            <a 
                              href="#"
                              onClick={(e) => handleWhatsAppPrescriptionShare(e, presc)}
                              className="btn" 
                              style={{ 
                                padding: '0.4rem 0.6rem', 
                                backgroundColor: '#dcf8c6', 
                                color: '#128C7E', 
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Enviar por WhatsApp"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'block' }}>
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                              </svg>
                            </a>
                            <button
                              onClick={() => handleSendPrescriptionEmail(presc.id)}
                              disabled={sendingPrescEmail === presc.id}
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: sendingPrescEmail === presc.id ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingPrescEmail === presc.id ? 'wait' : 'pointer' }}
                              title="Enviar Receta por Correo Electrónico"
                            >
                              {sendingPrescEmail === presc.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Medicine Details — solo lectura: las recetas son inmutables una vez emitidas */}
                        {isExpanded && (
                          <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            backgroundColor: 'rgba(13, 148, 136, 0.04)',
                            borderRadius: '8px',
                            border: '1px solid rgba(13, 148, 136, 0.12)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <Pill size={16} color="var(--primary)" />
                              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medicamentos Recetados</p>
                            </div>

                            {/* Medicamentos (solo lectura) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {/* Table Header */}
                              <div style={{
                                padding: '0.4rem 0.6rem',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                <span>Medicamento</span>
                              </div>
                              {/* Medicine Rows */}
                              {(presc.medicines || []).map((med: any, idx: number) => (
                                <div key={idx} style={{
                                  padding: '0.5rem 0.6rem',
                                  backgroundColor: 'var(--bg-card)',
                                  borderRadius: '6px',
                                  fontSize: '0.82rem',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-main)',
                                }}>
                                  <strong>{idx + 1}. {med.name}</strong>{medicineDetail(med) && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — {medicineDetail(med)}</span>}
                                </div>
                              ))}
                            </div>

                            {presc.notes && (
                              <div style={{
                                marginTop: '0.75rem',
                                padding: '0.6rem 0.8rem',
                                backgroundColor: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: '6px',
                                borderLeft: '3px solid #f59e0b',
                              }}>
                                <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92400e', margin: '0 0 0.25rem', textTransform: 'uppercase' }}>📝 Indicaciones</p>
                                <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0, whiteSpace: 'pre-line' }}>{presc.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Prescription Email Toast */}
              {prescEmailMsg && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  backgroundColor: prescEmailMsg.type === 'success' ? '#dcfce7' : '#fee2e2',
                  color: prescEmailMsg.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${prescEmailMsg.type === 'success' ? '#86efac' : '#fecaca'}`,
                  animation: 'fadeIn 0.3s ease-out',
                }}>
                  {prescEmailMsg.text}
                </div>
              )}
            </div>
          )}

          {/* TAB: LABORATORIOS SOLICITADOS */}
          {activeTab === 'laborders' && (
            <LabOrdersTab
              labOrders={labOrders}
              styles={styles}
              expandedLabOrder={expandedLabOrder}
              setExpandedLabOrder={setExpandedLabOrder}
              onWhatsApp={handleWhatsAppLabShare}
              onSendEmail={handleSendLabEmail}
              sendingEmailId={sendingLabEmail}
              emailMsg={labEmailMsg}
            />
          )}

          {activeTab === 'studyrequests' && (
            <StudyRequestsTab
              studyRequests={studyRequests}
              styles={styles}
              expandedStudyRequest={expandedStudyRequest}
              setExpandedStudyRequest={setExpandedStudyRequest}
              onWhatsApp={handleWhatsAppStudyShare}
              onSendEmail={handleSendStudyEmail}
              sendingEmailId={sendingStudyEmail}
              emailMsg={studyEmailMsg}
            />
          )}

          {/* TAB: INCAPACIDADES MÉDICAS (visible para todos los roles; asistente/enfermería pueden imprimir/enviar) */}
          {activeTab === 'incapacidades' && (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Incapacidades Médicas Emitidas</h3>
                <span className="badge badge-info">{medicalLeaves.length} Incapacidades</span>
              </div>

              {medicalLeaves.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <FileBadge size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>Este paciente no tiene incapacidades médicas emitidas aún.</p>
                </div>
              ) : (
                <div style={styles.studiesList}>
                  {medicalLeaves.map((m) => {
                    const date = new Date(m.created_at).toLocaleDateString('es-HN')
                    const docName = doctorShortName(m.user_profiles?.first_name, m.user_profiles?.last_name, m.user_profiles?.gender)
                    return (
                      <div key={m.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ ...styles.studyInfo, flex: 1 }}>
                            <FileBadge size={22} color="var(--primary)" />
                            <div style={{ flex: 1 }}>
                              <p style={styles.studyNameText}>Incapacidad Médica{m.verification_code ? ` - Código: ${m.verification_code}` : ''}</p>
                              <p style={styles.studyMeta}>Emitida el {date} por {docName}</p>
                            </div>
                          </div>
                          <div style={styles.studyActions}>
                            <a
                              href={`/consultations/${m.id}/print`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                              title="Imprimir Incapacidad"
                            >
                              <Printer size={14} />
                            </a>
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); handleWhatsAppLeaveShare(m) }}
                              className="btn"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Enviar por WhatsApp"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'block' }}>
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                              </svg>
                            </a>
                            <button
                              onClick={() => handleSendIncapacidadEmail(m.id)}
                              disabled={sendingLeaveEmail === m.id}
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: sendingLeaveEmail === m.id ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingLeaveEmail === m.id ? 'wait' : 'pointer' }}
                              title="Enviar Incapacidad por Correo Electrónico"
                            >
                              {sendingLeaveEmail === m.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            </button>
                          </div>
                        </div>

                        {m.medical_leave && (
                          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{m.medical_leave}</p>
                        )}

                        {leaveEmailMsg && leaveEmailMsg.id === m.id && (
                          <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', fontWeight: 600, color: leaveEmailMsg.type === 'success' ? '#15803d' : '#dc2626' }}>{leaveEmailMsg.text}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: REFERENCIAS MÉDICAS (misma lógica que incapacidades; visible para todos los roles) */}
          {activeTab === 'referencias' && (
            <div style={styles.tabView}>
              <div style={styles.tabHeader}>
                <h3 style={styles.tabTitle}>Referencias Médicas Emitidas</h3>
                <span className="badge badge-info">{referrals.length} Referencias</span>
              </div>

              {referrals.length === 0 ? (
                <div style={styles.tabEmptyState}>
                  <Share2 size={40} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                  <p>Este paciente no tiene referencias médicas emitidas aún.</p>
                </div>
              ) : (
                <div style={styles.studiesList}>
                  {referrals.map((r) => {
                    const date = new Date(r.created_at).toLocaleDateString('es-HN')
                    const docName = doctorShortName(r.user_profiles?.first_name, r.user_profiles?.last_name, r.user_profiles?.gender)
                    return (
                      <div key={r.id} className="card" style={{ ...styles.studyRow, flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ ...styles.studyInfo, flex: 1 }}>
                            <Share2 size={22} color="var(--primary)" />
                            <div style={{ flex: 1 }}>
                              <p style={styles.studyNameText}>Referencia Médica{r.verification_code ? ` - Código: ${r.verification_code}` : ''}</p>
                              <p style={styles.studyMeta}>Emitida el {date} por {docName}</p>
                            </div>
                          </div>
                          <div style={styles.studyActions}>
                            <a
                              href={`/consultations/${r.id}/print?doc=referral`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none' }}
                              title="Imprimir Referencia"
                            >
                              <Printer size={14} />
                            </a>
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); handleWhatsAppReferralShare(r) }}
                              className="btn"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: '#dcf8c6', color: '#128C7E', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Enviar por WhatsApp"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: 'block' }}>
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
                              </svg>
                            </a>
                            <button
                              onClick={() => handleSendReferralEmail(r.id)}
                              disabled={sendingReferralEmail === r.id}
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.6rem', backgroundColor: sendingReferralEmail === r.id ? '#c7d2fe' : '#e0e7ff', color: '#4338ca', border: 'none', cursor: sendingReferralEmail === r.id ? 'wait' : 'pointer' }}
                              title="Enviar Referencia por Correo Electrónico"
                            >
                              {sendingReferralEmail === r.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            </button>
                          </div>
                        </div>

                        {r.referral && (
                          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{r.referral}</p>
                        )}

                        {referralEmailMsg && referralEmailMsg.id === r.id && (
                          <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', fontWeight: 600, color: referralEmailMsg.type === 'success' ? '#15803d' : '#dc2626' }}>{referralEmailMsg.text}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ESTUDIOS */}
          {activeTab === 'studies' && (
            <div style={styles.tabView}>
              <h3 style={styles.tabTitle}>Estudios Médicos y Archivos</h3>

              {/* Formulario de subida de archivo */}
              <StudyUploader patientId={patient.id} />

              {/* Lista de archivos */}
              <StudyList
                studies={studies}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                isOrgAdmin={isOrgAdmin}
              />
            </div>
          )}

        {/* TAB 5: PEDIATRÍA */}
        {activeTab === 'pediatrics' && patient.is_pediatric && (
          <div style={styles.tabView}>
            <div style={styles.tabHeader}>
              <h3 style={styles.tabTitle}>Expediente Pediátrico</h3>
            </div>
            
            <PediatricGrowthChart consultations={consultations} patient={patient} />
          </div>
        )}
      </div>
      </div>

      <WhatsAppShareModal
        presc={whatsappShare?.doc}
        docType={whatsappShare?.docType || 'prescription'}
        patient={patient}
        appUrl={appUrl}
        onClose={() => setWhatsappShare(null)}
      />

      {showVitalsModal && (
        <PreclinicalVitalsModal
          patient={patient}
          appointmentId={null}
          onClose={() => setShowVitalsModal(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {showLeaveModal && lastConsult && (
        <MedicalLeaveModal
          consultation={lastConsult}
          patient={patient}
          onClose={() => setShowLeaveModal(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    color: 'var(--primary)',
    fontSize: '0.85rem',
    fontWeight: '600',
    textDecoration: 'none',
    width: 'fit-content',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  headerCard: {
    padding: '2rem',
  },
  headerLayout: {
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    flexWrap: 'wrap',
  },
  avatar: {
    width: '72px',
    height: '72px',
    borderRadius: '20px',
    backgroundColor: 'var(--primary-light)',
    color: 'var(--primary)',
    fontSize: '1.5rem',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(13, 148, 136, 0.2)',
  },
  profileDetails: {
    flex: 1,
  },
  patientName: {
    // En una sola línea; el tamaño se reduce en pantallas pequeñas (móvil) para que no se parta.
    fontSize: 'clamp(1.15rem, 4.5vw, 1.5rem)',
    fontWeight: '800',
    whiteSpace: 'nowrap',
    margin: 0,
  },
  demographicsSub: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
  },
  contactRow: {
    display: 'flex',
    gap: '1.5rem',
    marginTop: '0.5rem',
    flexWrap: 'wrap',
  },
  contactItem: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  headerActions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  allergiesRibbon: {
    marginTop: '1.5rem',
    paddingTop: '1.25rem',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
  },
  allergiesLabel: {
    fontWeight: '700',
    color: '#f87171',
  },
  allergiesValue: {
    color: 'var(--text-main)',
    fontWeight: '600',
  },
  editCard: {
    padding: '2rem',
    border: '1px solid var(--primary)',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '1.5rem',
  },
  expedienteContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  tabsRow: {
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '1px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.25rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.25rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--primary)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    borderBottom: '2px solid var(--primary)',
  },
  tabContentContainer: {
    marginTop: '0.5rem',
  },
  tabView: {
    display: 'flex',
    flexDirection: 'column',
  },
  tabHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
  },
  tabTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    marginBottom: '1.25rem',
  },
  tabEmptyState: {
    padding: '4rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    paddingLeft: '1.5rem',
    borderLeft: '2px solid var(--border-color)',
    marginLeft: '0.5rem',
    gap: '2rem',
  },
  timelineItem: {
    position: 'relative',
  },
  timelineBadge: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    left: '-22px',
    top: '1.5rem',
    border: '2px solid var(--bg-main)',
  },
  timelineCard: {
    padding: '1.5rem',
  },
  timelineCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  consultDate: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--primary)',
  },
  consultDoctor: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  vitalsRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  vitalTag: {
    fontSize: '0.7rem',
    padding: '0.2rem 0.5rem',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '4px',
    color: 'var(--text-main)',
    fontWeight: '600',
    border: '1px solid var(--border-color)',
  },
  consultField: {
    marginBottom: '0.85rem',
  },
  fieldLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    fontWeight: '700',
    marginBottom: '0.15rem',
  },
  fieldText: {
    fontSize: '0.9rem',
    color: 'var(--text-main)',
    lineHeight: '1.5',
    whiteSpace: 'pre-line',
  },
  historyBlock: {
    padding: '1.5rem',
  },
  historyBlockTitle: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: 'var(--primary)',
    marginBottom: '0.75rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.25rem',
  },
  historyBlockText: {
    fontSize: '0.875rem',
    color: 'var(--text-main)',
    whiteSpace: 'pre-line',
  },
  uploadStudyCard: {
    padding: '1.25rem',
    marginBottom: '1.5rem',
    border: '1px dashed var(--border-color)',
  },
  uploadForm: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  studiesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  studyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
  },
  studyInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  studyNameText: {
    fontSize: '0.9rem',
    fontWeight: '700',
  },
  studyMeta: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  studyActions: {},
}
