export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

// Extrait les tableaux Markdown pour en faire des données structurées
export function extractTables(markdown: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const lines = markdown.split("\n");
  let currentTable: ExtractedTable | null = null;
  let inTable = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const isTableRow = line.startsWith("|") && line.endsWith("|");

    if (isTableRow) {
      const cells = line
        .split("|")
        .map((cell) => {
          let c = cell.trim();
          c = c.replace(/\*\*([^*]+)\*\*/g, "$1"); // Gras **texte**
          c = c.replace(/\*([^*]+)\*/g, "$1"); // Italique *texte*
          c = c.replace(/`([^`]+)`/g, "$1"); // Code inline `code`
          c = c.replace(/^'([^']+)'$/, "$1"); // Quotes simples 'texte'
          return c.trim();
        })
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      const isSeparator = cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        currentTable = { headers: cells, rows: [] };
      } else if (currentTable) {
        currentTable.rows.push(cells);
      }
    } else {
      if (inTable && currentTable) {
        tables.push(currentTable);
        currentTable = null;
        inTable = false;
      }
    }
  }
  if (inTable && currentTable) {
    tables.push(currentTable);
  }

  // Normalisation : s'assurer que la 1ère colonne est "Ligne"
  for (const t of tables) {
    if (!/^ligne$/i.test(t.headers[0]?.trim())) {
      t.headers.unshift("Ligne");
      for (let r = 0; r < t.rows.length; r++) {
        t.rows[r].unshift(`Ligne ${r + 1}`);
      }
    }
  }

  return tables;
}

// Ajoute la colonne "Ligne" aux tableaux Markdown d'une réponse (pour affichage)
export function normalizeTablesInResponse(response: string): string {
  const lines = response.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inCodeBlock = false;
  let hasLigne = false;
  let buffer: string[] = [];

  const isSepLine = (l: string) => {
    const c = l.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
    return c.length > 0 && c.every((x) => /^\s*:?-+:?\s*$/.test(x.trim()));
  };

  const flushTable = () => {
    if (buffer.length === 0) return;
    if (!hasLigne) {
      const headerCells = buffer[0].split("|");
      if (headerCells.length >= 3) {
        headerCells.splice(1, 0, " Ligne ");
        buffer[0] = headerCells.join("|");
      }
      let dataIdx = 0;
      for (let i = 1; i < buffer.length; i++) {
        if (isSepLine(buffer[i])) {
          // Insérer " Ligne " dans le séparateur aussi pour garder le nb de colonnes
          const cells = buffer[i].split("|");
          if (cells.length >= 3) {
            cells.splice(1, 0, " :--- ");
            buffer[i] = cells.join("|");
          }
          continue;
        }
        dataIdx++;
        const cells = buffer[i].split("|");
        if (cells.length >= 3) {
          cells.splice(1, 0, ` Ligne ${dataIdx} `);
          buffer[i] = cells.join("|");
        }
      }
    }
    out.push(...buffer);
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(rawLine);
      continue;
    }
    if (inCodeBlock) {
      out.push(rawLine);
      continue;
    }

    const isTableRow = line.startsWith("|") && line.endsWith("|");
    if (isTableRow) {
      const cellsForSep = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      const isSep = cellsForSep.length > 0 && cellsForSep.every((c) => /^\s*:?-+:?\s*$/.test(c.trim()));
      if (isSep) {
        buffer.push(rawLine);
        continue;
      }

      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      if (!inTable) {
        flushTable();
        inTable = true;
        hasLigne = /^ligne$/i.test(cells[0]?.trim());
        buffer = [rawLine];
      } else {
        buffer.push(rawLine);
      }
    } else {
      if (inTable) {
        inTable = false;
        flushTable();
      }
      out.push(rawLine);
    }
  }
  if (inTable) flushTable();
  return out.join("\n");
}
