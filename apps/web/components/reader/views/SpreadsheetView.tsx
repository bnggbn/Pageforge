import type { ScrollDocumentViewProps } from './types'
import { SectionSelector } from './SectionSelector'
import { ScrollReaderFrame } from './ScrollReaderFrame'

export function SpreadsheetView({ doc, progress, onSelectQuote }: ScrollDocumentViewProps) {
  const section = Math.min(Math.max(0, progress.section), Math.max(0, doc.sheets.length - 1))
  return (
    <>
      <SectionSelector
        titles={doc.sheets.map((sheet) => sheet.name)}
        section={section}
        label="工作表"
        onChange={progress.changeSection}
      />
      <ScrollReaderFrame progress={progress} onSelectQuote={onSelectQuote}>
        <h2>{doc.sheets[section]?.name}</h2>
        <p className="small-note text-[11px] text-muted leading-[1.8] my-2.5 mx-0">
          顯示儲存格原始值與公式的快取結果；不重算公式，也不保留 Excel 樣式。
        </p>
        <div className="reader-table-wrap overflow-auto max-w-full my-5 mx-0">
          <table>
            <tbody>
              {doc.sheets[section]?.rows.map((row, index) => (
                <tr data-block={`row-${index}`} key={index}>
                  <th scope="row">{index + 1}</th>
                  {row.map((cell, column) => (
                    <td key={column}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollReaderFrame>
    </>
  )
}
