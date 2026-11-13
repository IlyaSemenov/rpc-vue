import { expect, test } from "bun:test"

import { markRaw, reactive } from "vue"

import { cloneQueryInput } from "./input"

/** An application value whose state lives in a private field that a property copy loses. */
class Secret {
  #value: string
  constructor(value: string) {
    this.#value = value
  }
  get value() {
    return this.#value
  }
}

/** An application value whose state lives in public fields. */
class Filter {
  constructor(public term: string) {}
}

test("copies plain objects, arrays, built-ins and class instances", () => {
  const date = new Date("2026-01-01T00:00:00Z")
  const filter = new Filter("vue")
  const input = { ids: [1, 2], date, tags: new Set(["a"]), filter }
  const copy = cloneQueryInput(input)
  expect(copy).toEqual(input)
  expect(copy.ids).not.toBe(input.ids)
  expect(copy.date).not.toBe(date)
  expect(copy.tags).not.toBe(input.tags)
  expect(copy.filter).not.toBe(filter)
  expect(copy.filter).toBeInstanceOf(Filter)
})

test("keeps markRaw values by reference at the root and inside copied objects", () => {
  const secret = markRaw(new Secret("key"))
  const input = reactive({ page: { number: 1 }, secret })
  const copy = cloneQueryInput(input)
  expect(copy.page).not.toBe(input.page)
  expect(copy.secret).toBe(secret)
  expect(copy.secret.value).toBe("key")
  expect(cloneQueryInput(secret)).toBe(secret)
})
