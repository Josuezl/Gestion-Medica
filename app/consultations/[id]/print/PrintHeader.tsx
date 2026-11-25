import type { ClinicRow, DoctorProfileRow } from '@/utils/clinicalTypes'
import IconoMuela from '@/app/components/IconoMuela'

export default function PrintHeader({ clinic, doctor, docName, docSpecialty, reporteDental }: {
  clinic: ClinicRow
  doctor: DoctorProfileRow
  docName: string
  docSpecialty: string
  reporteDental?: boolean
}) {
  if (reporteDental) {
    return (
      <header className="reporte-cabecera">
        <div className="reporte-clinica">
          {clinic.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logo_url} alt="" />
          ) : <IconoMuela size={40} strokeWidth={1.5} />}
          <div>
            <p className="clinic-name">{clinic.name || 'Clínica'}</p>
            <p className="clinic-detail">Tel: {clinic.phone || '—'} · {clinic.address || 'Honduras'}</p>
          </div>
        </div>
        <div className="reporte-profesional">
          <p className="doctor-name">{docName}</p>
          <p className="doctor-specialty">{docSpecialty}</p>
        </div>
      </header>
    )
  }

  const logoUrl = doctor.practice_logo_url || clinic.logo_url
  // Si el médico usa SU PROPIO logo, este suele incluir su nombre/especialidad → se ocultan del
  // encabezado. Con el logo global de la clínica (o sin logo) sí se muestran.
  const usingOwnLogo = !!doctor.practice_logo_url
  // Con el logo global de la clínica, acercar la línea de tel/dirección al logo (se ve muy separada).
  const isGlobalLogo = !!logoUrl && !usingOwnLogo
  return (
    <div className="header">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="header-logo" src={logoUrl} alt="Logo" />
      ) : (
        <h1 className="clinic-name">{doctor.practice_name || clinic.name}</h1>
      )}
      <p className="clinic-detail" style={isGlobalLogo ? { marginTop: '-12px' } : undefined}>Tel: {doctor.practice_phone || clinic.phone || 'N/A'}&nbsp;&nbsp;•&nbsp;&nbsp;{doctor.practice_address || clinic.address || 'Honduras'}</p>
      {!usingOwnLogo && (
        <div className="doc-block">
          <h2 className="doctor-name">{docName}</h2>
          <p className="doctor-specialty">{docSpecialty}</p>
        </div>
      )}
    </div>
  )
}
