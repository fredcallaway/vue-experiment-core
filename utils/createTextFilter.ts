/**
 * Text filter with boolean logic
 * - Spaces and & are AND
 * - , and | are OR (OR has precedence)
 * - ! is negation
 * - Full search (substring matching)
 */
export function createTextFilter(pattern: string): (text: string) => boolean {
  if (!pattern || pattern.trim().length === 0) {
    return () => true
  }

  const cnf = parseToCNF(pattern.trim())
  
  if (cnf.length === 0) {
    return () => true
  }

  // Compile each clause (disjunction) into regex patterns
  const compiledClauses = cnf.map(clause => 
    clause.map(term => {
      const isNegative = term.startsWith('!')
      const cleanTerm = isNegative ? term.slice(1).trim() : term.trim()
      
      if (cleanTerm.length === 0) {
        return { regex: /.*/, isNegative }
      }
      
      // Escape special regex chars except * and ?
      const escaped = cleanTerm
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      
      return {
        regex: new RegExp(escaped, 'i'),
        isNegative
      }
    })
  )

  return (text: string) => {
    // CNF: all clauses (OR groups) must be satisfied (AND)
    return compiledClauses.every(clause => {
      // At least one term in the clause must match
      return clause.some(({ regex, isNegative }) => {
        const matches = regex.test(text)
        return isNegative ? !matches : matches
      })
    })
  }
}

function parseToCNF(input: string): string[][] {
  // OR has precedence, so parse OR groups first, then AND connects them
  // Result is CNF: (OR group) AND (OR group) AND ...
  
  const clauses: string[] = []
  let current = ''
  let i = 0
  
  while (i < input.length) {
    const char = input[i]
    
    if (char === ',' || char === '|') {
      // OR operator - continue current clause
      current += char
      i++
      continue
    }
    
    if (char === '&') {
      // & is always AND - end current clause
      if (current.trim()) {
        clauses.push(current.trim())
        current = ''
      }
      i++
      continue
    }
    
    if (/\s/.test(char)) {
      // Space: check if it's AND (not followed by OR) or just whitespace
      let j = i + 1
      while (j < input.length && /\s/.test(input[j])) j++
      
      if (j < input.length && (input[j] === ',' || input[j] === '|')) {
        // Space before OR - ignore it
        i++
        continue
      }
      
      // Space is AND - end current clause
      if (current.trim()) {
        clauses.push(current.trim())
        current = ''
      }
      i = j
      continue
    }
    
    current += char
    i++
  }
  
  if (current.trim()) {
    clauses.push(current.trim())
  }
  
  if (clauses.length === 0) {
    clauses.push(input)
  }
  
  // Split each clause by OR operators to get terms
  return clauses.map(clause => {
    return clause
      .split(/[,|]/)
      .map(term => term.trim())
      .filter(term => term.length > 0)
  }).filter(clause => clause.length > 0)
}

