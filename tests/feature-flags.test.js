// tests/feature-flags.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFeatureEnabled, getEnabledFeatures, FEATURE_FLAG_KEYS } from '../src/lib/feature-flags.ts'

test('isFeatureEnabled: sem a env var definida, é false (fail-closed)', () => {
  delete process.env.FEATURE_OUTLIER_DETECTION
  assert.equal(isFeatureEnabled('outlierDetection'), false)
})

test('isFeatureEnabled: qualquer valor != "true" continua false (evita "0"/"false" string ligar por engano)', () => {
  process.env.FEATURE_OUTLIER_DETECTION = 'false'
  assert.equal(isFeatureEnabled('outlierDetection'), false)
  process.env.FEATURE_OUTLIER_DETECTION = '1'
  assert.equal(isFeatureEnabled('outlierDetection'), false)
  delete process.env.FEATURE_OUTLIER_DETECTION
})

test('isFeatureEnabled: "true" liga a flag', () => {
  process.env.FEATURE_OUTLIER_DETECTION = 'true'
  assert.equal(isFeatureEnabled('outlierDetection'), true)
  delete process.env.FEATURE_OUTLIER_DETECTION
})

test('getEnabledFeatures: devolve um snapshot com todas as flags conhecidas', () => {
  delete process.env.FEATURE_OUTLIER_DETECTION
  delete process.env.FEATURE_K8S_DBM_COVERAGE
  const snapshot = getEnabledFeatures()
  for (const key of FEATURE_FLAG_KEYS) {
    assert.ok(key in snapshot, `esperava a chave ${key} no snapshot`)
    assert.equal(snapshot[key], false)
  }

  process.env.FEATURE_K8S_DBM_COVERAGE = 'true'
  const withOne = getEnabledFeatures()
  assert.equal(withOne.k8sDbmCoverage, true)
  assert.equal(withOne.outlierDetection, false)
  delete process.env.FEATURE_K8S_DBM_COVERAGE
})
