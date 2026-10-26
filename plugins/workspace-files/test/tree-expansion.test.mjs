import test from 'node:test'
import assert from 'node:assert/strict'
import { createTreeExpansionBudget } from '../lib/client/explorer/tree-expansion.js'

test('limits visible entries once per directory so refreshes do not spend the budget again', () => {
  let notices = 0
  const budget = createTreeExpansionBudget(3, () => { notices += 1 }, 10, 3)
  assert.equal(budget.takeEntries('a', 2), 2)
  assert.equal(budget.takeEntries('b', 4), 1)
  assert.equal(budget.takeEntries('c', 1), 0)
  assert.equal(budget.takeEntries('a', 2), 2)
  assert.equal(budget.takeEntries('b', 4), 1)
  assert.equal(notices, 1)
})

test('limits distinct directory claims once per Expand All action', () => {
  let notices = 0
  const budget = createTreeExpansionBudget(7, () => { notices += 1 }, 2)
  assert.equal(budget.claim('a'), true)
  assert.equal(budget.claim('b'), true)
  assert.equal(budget.claim('a'), true)
  assert.equal(budget.claim('c'), false)
  assert.equal(budget.claim('d'), false)
  assert.equal(notices, 1)
})
