import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { medicineDetail } from './medicines'

interface PDFPrescriptionData {
  clinicName: string
  clinicPhone: string
  clinicAddress: string
  doctorName: string
  doctorSpecialty: string
  doctorProfessionalId: string
  patientName: string
  patientAge: number
  patientDni: string
  date: string
  medicines: any[]
  notes: string
  verificationCode: string
  siteUrl: string
  doctorSignatureUrl?: string
}

export async function generatePrescriptionPDF(data: PDFPrescriptionData): Promise<ArrayBuffer> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // 1. Línea estética superior (Deep Teal)
  doc.setFillColor(13, 148, 136)
  doc.rect(0, 0, 210, 8, 'F')

  // 2. Encabezado - Nombre de la Clínica
  doc.setTextColor(15, 23, 42)
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(data.clinicName, 15, 25)

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text(`Tel: ${data.clinicPhone || 'N/A'}`, 15, 31)
  doc.text(data.clinicAddress || 'Dirección de clínica no disponible', 15, 35)

  // 3. Información del Doctor (Alineación Derecha)
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text(data.doctorName, 195, 25, { align: 'right' })
  
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(13, 148, 136)
  doc.text(data.doctorSpecialty, 195, 29.5, { align: 'right' })
  
  // 4. Divisor superior
  doc.setDrawColor(226, 232, 240)
  doc.line(15, 40, 195, 40)

  // 5. Caja de Datos del Paciente (Gris claro)
  doc.setFillColor(248, 250, 252)
  doc.rect(15, 45, 180, 26, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.rect(15, 45, 180, 26, 'D')

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text('PACIENTE:', 20, 51)
  doc.setFont('Helvetica', 'normal')
  doc.text(data.patientName, 45, 51)

  doc.setFont('Helvetica', 'bold')
  doc.text('EDAD / DNI:', 20, 57)
  doc.setFont('Helvetica', 'normal')
  doc.text(`${data.patientAge} años   |   DNI: ${data.patientDni || 'N/A'}`, 45, 57)

  doc.setFont('Helvetica', 'bold')
  doc.text('FECHA:', 20, 63)
  doc.setFont('Helvetica', 'normal')
  doc.text(data.date, 45, 63)

  // 6. Título de Prescripción
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(13, 148, 136)
  doc.text('Rp: PRESCRIPCIÓN MÉDICA', 15, 82)

  // 7. Lista de medicamentos
  let y = 92
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text('Medicamento', 15, 88)

  doc.setDrawColor(203, 213, 225)
  doc.line(15, 90, 195, 90)

  doc.setFont('Helvetica', 'normal')
  data.medicines.forEach((med, idx) => {
    // Si excede el tamaño de página
    if (y > 215) {
      doc.addPage()
      doc.setFillColor(13, 148, 136)
      doc.rect(0, 0, 210, 8, 'F')
      y = 25
    }

    // Una sola columna a todo lo ancho: nombre (+ detalle en línea para recetas viejas).
    const detail = medicineDetail(med)
    const line = detail ? `${idx + 1}. ${med.name || ''} — ${detail}` : `${idx + 1}. ${med.name || ''}`
    doc.setFont('Helvetica', 'bold')
    const lines = doc.splitTextToSize(line, 180)
    doc.text(lines, 15, y)
    y += Math.max(lines.length * 5.5, 9)
  })

  // 8. Indicaciones de la receta
  if (data.notes) {
    y += 4
    if (y > 220) {
      doc.addPage()
      doc.setFillColor(13, 148, 136)
      doc.rect(0, 0, 210, 8, 'F')
      y = 25
    }
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(13, 148, 136)
    doc.text('INDICACIONES GENERALES:', 15, y)
    
    y += 5
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    
    const splitNotes = doc.splitTextToSize(data.notes, 180)
    doc.text(splitNotes, 15, y)
    y += splitNotes.length * 5.5
  }

  // 9. Pie de página: Verificación y firma
  const footerY = 255
  doc.setDrawColor(226, 232, 240)
  doc.line(15, footerY - 8, 195, footerY - 8)

  // QR de verificación (apunta a /verificar/<código>) + código
  const verifyUrl = `${data.siteUrl}/verificar/${data.verificationCode}`
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
  doc.addImage(qrDataUrl, 'PNG', 15, footerY - 6, 20, 20)

  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('RECETA MÉDICA VERIFICADA', 40, footerY - 2)

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`Código de Validación: ${data.verificationCode}`, 40, footerY + 2)
  doc.text('Escanea el QR para validar esta receta', 40, footerY + 6)
  doc.text('en su versión digital.', 40, footerY + 10)

  // Firma/sello del médico (imagen cargada en su perfil), encima de la línea de firma.
  if (data.doctorSignatureUrl) {
    try {
      const resp = await fetch(data.doctorSignatureUrl)
      if (resp.ok) {
        const buf = await resp.arrayBuffer()
        const ct = (resp.headers.get('content-type') || '').toLowerCase()
        const fmt = ct.includes('png') ? 'PNG' : ct.includes('webp') ? 'WEBP' : 'JPEG'
        const dataUrl = `data:${ct || 'image/png'};base64,${Buffer.from(buf).toString('base64')}`
        // Centrada sobre la línea de firma (la línea termina en x=195, ancho ~70mm desde 125).
        doc.addImage(dataUrl, fmt, 137, footerY - 29, 56, 26)
      }
    } catch {
      // Si la descarga falla, se omite la firma y se deja solo la línea.
    }
  }

  // Línea de firma
  doc.text('__________________________________', 195, footerY - 1, { align: 'right' })
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(data.doctorName, 195, footerY + 4, { align: 'right' })
  doc.setFont('Helvetica', 'normal')
  doc.text(data.doctorSpecialty, 195, footerY + 8, { align: 'right' })
  doc.text('Firma Digitalizada / Sello Electrónico', 195, footerY + 12, { align: 'right' })

  // Retornar buffer binario
  return doc.output('arraybuffer')
}
