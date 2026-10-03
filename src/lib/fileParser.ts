import * as XLSX from 'xlsx'

export interface ColumnStat {
  name: string
  type: 'number' | 'date' | 'text' | 'empty'
  nullCount: number
  filledCount: number
  sampleValues: (string | number)[]
}

export interface ParsedSheet {
  name: string
  headers: string[]
  rows: (string | number | null)[][]
  totalRows: number
  totalCols: number
  stats?: ColumnStat[]
}

export interface FileParseResult {
  fileName: string
  fileSize: number
  sheets: ParsedSheet[]
  textRepresentation: string // pour le prompt IA
  columnStats?: Record<string, ColumnStat[]>
}

export function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n/)[0] || ''
  const counts: Record<string, number> = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length,
  }

  // Si des points-virgules sont présents (format français courant), leur donner la priorité
  if (counts[';'] > 0 && counts[';'] >= counts[',']) {
    return ';'
  }

  let bestDelimiter = ','
  let maxCount = 0
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      bestDelimiter = delim
    }
  }
  return bestDelimiter
}

const DATE_REGEX_ISO = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/
const DATE_REGEX_FR = /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/

export function buildColumnStats(
  headers: string[],
  rows: (string | number | null)[][]
): ColumnStat[] {
  return headers.map((header, colIdx) => {
    let nullCount = 0
    let numberCount = 0
    let dateCount = 0
    let filledCount = 0
    const sampleValues: (string | number)[] = []

    for (const row of rows) {
      const val = row[colIdx]
      if (val === null || val === undefined || val === '') {
        nullCount++
      } else {
        filledCount++
        if (typeof val === 'number') {
          numberCount++
        } else if (typeof val === 'string') {
          const trimmed = val.trim()
          if (DATE_REGEX_ISO.test(trimmed) || DATE_REGEX_FR.test(trimmed)) {
            dateCount++
          } else if (!isNaN(Number(trimmed.replace(',', '.'))) && trimmed !== '') {
            numberCount++
          }
        }

        if (sampleValues.length < 3) {
          sampleValues.push(val)
        }
      }
    }

    let type: 'number' | 'date' | 'text' | 'empty' = 'text'
    if (filledCount === 0) {
      type = 'empty'
    } else if (dateCount / filledCount >= 0.5) {
      type = 'date'
    } else if (numberCount / filledCount >= 0.6) {
      type = 'number'
    }

    return {
      name: header,
      type,
      nullCount,
      filledCount,
      sampleValues,
    }
  })
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Échec de la lecture du fichier'))
    reader.readAsArrayBuffer(file)
  })
}

function formatCellDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sheetToParsedSheet(
  sheet: XLSX.WorkSheet,
  name: string,
  maxRows: number = 50
): ParsedSheet {
  const data = XLSX.utils.sheet_to_json<(unknown)[]>(sheet, {
    header: 1,
    defval: null,
  })

  const headers =
    data.length > 0
      ? (data[0] as unknown[]).map((h) =>
          h !== null && h !== undefined ? String(h) : ''
        )
      : []

  const rows = data.slice(1, maxRows).map((row) =>
    (row as unknown[]).slice(0, headers.length).map((c) => {
      if (c === null || c === undefined || c === '') return null
      if (c instanceof Date) return formatCellDate(c)
      if (typeof c === 'number') return c
      return String(c)
    })
  )

  const stats = buildColumnStats(headers, rows)

  return {
    name,
    headers,
    rows,
    totalRows: data.length > 0 ? data.length - 1 : 0,
    totalCols: headers.length,
    stats,
  }
}

function detectFormulas(sheet: XLSX.WorkSheet): Record<string, string> {
  const formulas: Record<string, string> = {}
  for (const cellAddr of Object.keys(sheet)) {
    if (cellAddr.startsWith('!')) continue
    const cell = sheet[cellAddr]
    if (cell?.f) {
      formulas[cellAddr] = cell.f.startsWith('=') ? cell.f : `=${cell.f}`
    }
  }
  return formulas
}

export function buildTextRepresentation(
  sheet: ParsedSheet,
  formulas: Record<string, string>,
  excludedColumns: string[] = []
): string {
  const lines: string[] = []
  lines.push(`[Feuille : ${sheet.name}]`)
  lines.push(`Colonnes : ${sheet.totalCols} · Lignes : ${sheet.totalRows}`)

  if (sheet.totalCols > 0) {
    lines.push(`En-têtes : ${sheet.headers.join(', ')}`)
  }

  const formulaEntries = Object.entries(formulas)
  if (formulaEntries.length > 0) {
    lines.push(`⚠️ Formules détectées dans le fichier d'origine (${formulaEntries.length}) :`)
    for (const [addr, f] of formulaEntries.slice(0, 10)) {
      lines.push(`  ${addr} : ${f}`)
    }
  }

  const excludedSet = new Set(excludedColumns.map((c) => c.toLowerCase().trim()))

  lines.push('')
  lines.push('| ' + sheet.headers.join(' | ') + ' |')
  lines.push('|' + sheet.headers.map(() => '---|').join(''))
  for (const row of sheet.rows.slice(0, 20)) {
    const vals = sheet.headers
      .map((h, colIdx) => {
        if (excludedSet.has(h.toLowerCase().trim())) {
          return '[CONFIDENTIEL]'
        }
        const c = row[colIdx]
        return c === null || c === undefined ? '' : String(c)
      })
      .join(' | ')
    lines.push('| ' + vals + ' |')
  }
  if (sheet.totalRows > 20) {
    lines.push(`*... ${sheet.totalRows - 20} lignes supplémentaires masquées*`)
  }
  return lines.join('\n')
}

export async function parseFile(
  file: File,
  excludedColumns: string[] = []
): Promise<FileParseResult> {
  const buffer = await readFileAsArrayBuffer(file)

  if (file.name.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer)
    const delimiter = detectCsvDelimiter(text)
    const workbook = XLSX.read(text, {
      type: 'string',
      raw: false,
      cellDates: true,
      FS: delimiter,
    })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const parsed = sheetToParsedSheet(sheet, 'CSV')
    const formulas = detectFormulas(sheet)
    const columnStats = { CSV: parsed.stats || [] }
    return {
      fileName: file.name,
      fileSize: file.size,
      sheets: [parsed],
      textRepresentation: buildTextRepresentation(parsed, formulas, excludedColumns),
      columnStats,
    }
  }

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheets: ParsedSheet[] = workbook.SheetNames.slice(0, 5).map((name) => {
    const sheet = workbook.Sheets[name]
    return sheetToParsedSheet(sheet, name)
  })

  const columnStats: Record<string, ColumnStat[]> = {}
  sheets.forEach((s) => {
    columnStats[s.name] = s.stats || []
  })

  const textRepresentations = sheets.map((s) => {
    const sheet = workbook.Sheets[s.name]
    const formulas = detectFormulas(sheet)
    return buildTextRepresentation(s, formulas, excludedColumns)
  })

  return {
    fileName: file.name,
    fileSize: file.size,
    sheets,
    textRepresentation: textRepresentations.join('\n\n'),
    columnStats,
  }
}
