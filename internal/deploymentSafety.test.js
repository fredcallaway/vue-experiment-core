import { expect, test } from 'vitest'
import { contactEmailError, versionWarnings } from './deploymentSafety'

test.each(['yourEmailAddress@fakeDomain.foo', ' YourEmailAddress@FAKEDOMAIN.foo ', '', null, 'not-an-email'])(
  'rejects an unconfigured participant contact: %j', email => expect(contactEmailError(email)).not.toBe(''),
)

test('accepts a configured contact', () => {
  expect(contactEmailError('researcher@university.edu')).toBe('')
})

test('only the most recent published study using this version determines reuse', () => {
  const sha = '12345678' + 'a'.repeat(32)
  const warnings = versionWarnings('pilot-2', sha, {
    draft: { version: 'pilot-2', sha: 'aaaaaaaa' },
    olderVersion: { version: 'pilot-1', sha: 'aaaaaaaa', publishTime: 1 },
    sameBuild: { version: 'pilot-2', sha: sha.slice(0, 8), publishTime: 1 },
    changedBuild: { version: 'pilot-2', sha: 'aaaaaaaa', publishTime: 1 },
    unknownBuild: { version: 'pilot-2', publishTime: 2 },
  })
  expect(warnings.map(warning => warning.studyId)).toEqual(['unknownBuild'])
  expect(warnings[0].publishedSha).toBeNull()
  expect(versionWarnings('pilot-3', sha, null)).toEqual([])
  expect(versionWarnings('pilot-2', sha, {
    olderBuild: { version: 'pilot-2', sha: 'aaaaaaaa', publishTime: 1 },
    deliberatelyReused: { version: 'pilot-2', sha: sha.slice(0, 8), publishTime: 2 },
  })).toEqual([])
})

test('compares full and legacy short commits in both directions without treating an empty SHA as a match', () => {
  const sha = '12345678' + 'a'.repeat(32)
  const studies = { posted: { version: 'pilot', sha, publishTime: 1 } }
  expect(versionWarnings('pilot', sha.slice(0, 8), studies)).toEqual([])
  expect(versionWarnings('pilot', '', studies)).toHaveLength(1)
})
