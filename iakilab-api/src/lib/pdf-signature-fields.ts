import { PDFDocument, PDFName, PDFSignature } from 'pdf-lib'

export function hasPdfSignature(pdf: PDFDocument) {
  return pdf.getForm().getFields().some(field =>
    field instanceof PDFSignature && field.acroField.dict.has(PDFName.of('V')),
  )
}
