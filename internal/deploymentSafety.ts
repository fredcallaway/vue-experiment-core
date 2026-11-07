export type StudyDeployment = {
  version?: string
  sha?: string
  publishTime?: number
}

export type VersionWarning = {
  studyId: string
  version: string
  publishedSha: string | null
  currentSha: string
  message: string
}

export function contactEmailError(email: unknown): string {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      /@fakedomain\./i.test(email)) {
    return 'Set contactEmail in epoch.config.ts to a real researcher email before building or deploying.'
  }
  return ''
}

export function versionWarnings(version: string, sha: string, studies: Record<string, StudyDeployment> | null) {
  const warnings: VersionWarning[] = []
  const posted = Object.entries(studies ?? {})
    .filter(([, study]) => study?.publishTime && study.version === version)
    .sort(([, a], [, b]) => b.publishTime! - a.publishTime!)
    .slice(0, 1)
  for (const [studyId, study] of posted) {
    const publishedSha = study.sha && /^[a-f0-9]{8,40}$/i.test(study.sha) ? study.sha : null
    if (publishedSha && /^[a-f0-9]{8,40}$/i.test(sha) &&
        (sha.startsWith(publishedSha) || publishedSha.startsWith(sha))) continue
    warnings.push({
      studyId, version, publishedSha, currentSha: sha,
      message: `Version ${version} was already posted in study ${studyId} ` +
        `(commit ${publishedSha ?? 'unknown'}); current commit is ${sha}. ` +
        'Choose a new dataset version in the Prolific interface if the participant procedure or analysis has changed. ' +
        'Keep it only after reviewing why these changes belong to the same version.',
    })
  }
  return warnings
}
