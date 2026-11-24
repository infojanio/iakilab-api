export type SignerStatus = { manageable?: boolean } & (
  | { status: 'UNAVAILABLE' | 'INVALID_CONFIGURATION' }
  | {
      status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_YET_VALID'
      validFrom: string
      validUntil: string
      daysUntilExpiry: number
    }

)

export const signingErrors: Record<string, string> = {
  A1_MANAGEMENT_UNAVAILABLE: 'O cadastro pelo painel precisa ser habilitado na API.',
  INVALID_A1_UPLOAD: 'Confira os arquivos e a senha do certificado. Cada arquivo pode ter até 1 MB.',
  LABORATORY_SIGNER_UNAVAILABLE: 'O A1 deste laboratório ainda não foi configurado.',
  LABORATORY_SIGNER_INVALID_CONFIGURATION: 'A configuração do A1 está inválida. Confira o certificado, a senha e os arquivos da cadeia de confiança.',
  A1_CERTIFICATE_EXPIRED: 'O certificado A1 venceu. Atualize o certificado.',
  A1_CERTIFICATE_NOT_YET_VALID: 'O certificado A1 ainda está fora do período de validade.',
  REPORT_SIGNING_FAILED: 'A assinatura do PDF falhou.',
  REPORT_SIGNATURE_VERIFICATION_FAILED: 'A verificação da assinatura ou da cadeia de confiança falhou.',
  REPORT_PUBLICATION_FAILED: 'A publicação do PDF falhou.',
  REPORT_PUBLICATION_STATE_UNKNOWN: 'O servidor não conseguiu confirmar o resultado da publicação. Confira o estado atual do laudo antes de tentar novamente.',
  ALREADY_SIGNED_ORIGINAL: 'O PDF original já contém uma assinatura.',
  ORIGINAL_PDF_REQUIRED: 'O PDF original está indisponível.',
  REPORT_PDF_CANNOT_BE_RENDERED: 'Não foi possível preparar o PDF original.',
  PDF_INTEGRITY_FAILURE: 'A conferência de integridade do PDF falhou.',
  INVALID_PDF: 'O arquivo PDF está inválido.',
}

export function issuanceFailureMessage(code: string) {
  if (code === 'REPORT_PUBLICATION_STATE_UNKNOWN') return signingErrors[code]
  return (Object.hasOwn(signingErrors, code) ? signingErrors[code] : 'A emissão falhou.') +
    ' O laudo continua privado. Corrija o problema e tente emitir novamente.'
}

export function describeSigner(info: SignerStatus) {
  switch (info.status) {
    case 'UNAVAILABLE': return signingErrors.LABORATORY_SIGNER_UNAVAILABLE
    case 'INVALID_CONFIGURATION': return signingErrors.LABORATORY_SIGNER_INVALID_CONFIGURATION
    case 'EXPIRED': return 'O certificado A1 venceu.'
    case 'NOT_YET_VALID': return signingErrors.A1_CERTIFICATE_NOT_YET_VALID
    case 'EXPIRING_SOON':
      return info.daysUntilExpiry === 1 ? 'O certificado A1 vence em até 1 dia.' :
        'O certificado A1 vence em ' + info.daysUntilExpiry + ' dias.'
    case 'VALID': return 'Certificado A1 dentro do período de validade.'
  }
}
