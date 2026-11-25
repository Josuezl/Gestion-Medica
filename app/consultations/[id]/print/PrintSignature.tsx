export default function PrintSignature({ signatureUrl, docName, docSpecialty }: {
  signatureUrl?: string | null
  docName: string
  docSpecialty: string
}) {
  return (
    <div className="sign">
      {signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signatureUrl} alt="Firma" />
      ) : (
        <div className="sign-empty" />
      )}
      <div className="sign-line">
        <p className="sign-name">{docName}</p>
        <p className="sign-spec">{docSpecialty}</p>
      </div>
    </div>
  )
}
