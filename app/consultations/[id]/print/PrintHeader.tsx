import type { ClinicRow, DoctorProfileRow } from '@/utils/clinicalTypes'

export default function PrintHeader({ clinic, doctor, docName, docSpecialty }: {
  clinic: ClinicRow
  doctor: DoctorProfileRow
  docName: string
  docSpecialty: string
}) {
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
