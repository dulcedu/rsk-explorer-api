import { errors, modules } from '../lib/types'
import config from '../lib/config'
const delayedFields = config.api.delayedFields || {}
const { MAX_LIMIT, LIMIT, MIN_LIMIT } = config.api

export const filterParams = (params) => {
  params = params || {}
  let { limit, sort, fields, query } = params
  params.limit = getLimit(limit)
  params.query = filterQuery(query)
  params.sort = filterSort(sort)
  params.fields = filterFields(fields)
  return params
}

export const getLimit = (limit) => {
  limit = limit || LIMIT
  limit = (limit > MAX_LIMIT) ? MAX_LIMIT : limit
  limit = (limit < MIN_LIMIT) ? MIN_LIMIT : limit
  return limit
}

export const filterFields = fields => {
  if (!fields) return
  let filtered = {}
  for (let p in fields) {
    let k = remove$(p)
    filtered[k] = (fields[p]) ? 1 : 0
  }
  return filtered
}

export const filterQuery = (query) => {
  if (!query) return
  if (typeof (query) === 'object') {
    if (Object.keys(query).length > 0) {
      return sanitizeQuery(query)
    }
  }
}

export const filterSort = (sort) => {
  if (!sort) return
  let filtered = null
  if (sort && typeof (sort) === 'object') {
    let keys = Object.keys(sort)
    filtered = {}
    for (let k of keys) {
      let val = sort[k]
      filtered[k] = (!val || val === 1) ? 1 : -1
    }
  }
  return retFiltered(filtered)
}

const sanitizeQuery = (query) => {
  let filtered = {}
  for (let p in query) {
    let k = remove$(p)
    if (k === p) filtered[k] = query[p]
  }
  return retFiltered(filtered)
}

const retFiltered = (filtered) => {
  return (filtered && Object.keys(filtered).length > 0) ? filtered : null
}

export const remove$ = value => value.replace('$', '')

export const formatRes = (payload) => {
  let { module, action, result, req, error } = payload
  module = (module) ? getModuleName(module) : null
  let data, pages, next, prev, delayed
  if (!result && !error) error = errors.EMPTY_RESULT
  if (error) {
    error = formatError(error)
  } else {
    ({ data, pages, next, prev, delayed } = result)
  }
  if (!data && !error) {
    if (req.getDelayed && delayed && delayed.registry) {
      error = formatError(errors.UPDATING_REGISTRY)
    } else {
      error = formatError(errors.EMPTY_RESULT)
    }
  }
  return { module, action, data, req, pages, error, prev, next, delayed }
}

export const formatError = error => {
  error.serverTime = Date.now()
  return error
}

export const publicSettings = () => {
  return config.publicSettings
}

export const getDelayedFields = (module, action) => {
  let delayed = (delayedFields[module]) ? delayedFields[module][action] : null
  if (delayed) delayed.module = module
  return delayed
}

export const getModule = module => modules[module] || module

export const getModuleName = key => Object.keys(modules)[Object.values(modules).indexOf(key)] || key

export { errors } from '../lib/types'
