/**
 * Tests for Supabase Cache System
 */

import { SupabaseCache, supabaseCache } from '../supabaseCache'

// Mock Supabase client
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [{ id: 1, name: 'Test' }],
          error: null
        }))
      }))
    }))
  }
}))

describe('SupabaseCache', () => {
  let cache

  beforeEach(() => {
    cache = new SupabaseCache({ defaultTTL: 1000 })
  })

  afterEach(() => {
    cache.clear()
  })

  test('should cache query results', async () => {
    const mockQueryFn = jest.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Test' }],
      error: null
    })

    // First call should execute query
    const result1 = await cache.getWithCache('test-key', mockQueryFn, { table: 'test' })
    expect(mockQueryFn).toHaveBeenCalledTimes(1)
    expect(result1).toEqual([{ id: 1, name: 'Test' }])

    // Second call should use cache
    const result2 = await cache.getWithCache('test-key', mockQueryFn, { table: 'test' })
    expect(mockQueryFn).toHaveBeenCalledTimes(1) // Still only called once
    expect(result2).toEqual([{ id: 1, name: 'Test' }])
  })

  test('should handle cache expiration', async () => {
    const mockQueryFn = jest.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Test' }],
      error: null
    })

    // Cache with very short TTL
    await cache.getWithCache('test-key', mockQueryFn, { table: 'test', ttl: 1 })
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Should execute query again
    await cache.getWithCache('test-key', mockQueryFn, { table: 'test', ttl: 1 })
    expect(mockQueryFn).toHaveBeenCalledTimes(2)
  })

  test('should invalidate cache by pattern', async () => {
    const mockQueryFn = jest.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Test' }],
      error: null
    })

    // Cache some data
    await cache.getWithCache('test-key-1', mockQueryFn, { table: 'test' })
    await cache.getWithCache('test-key-2', mockQueryFn, { table: 'test' })
    await cache.getWithCache('other-key', mockQueryFn, { table: 'other' })

    // Invalidate test keys
    const invalidated = cache.invalidate(['test-key'])
    expect(invalidated).toBe(2)

    // Should execute query again for test keys
    await cache.getWithCache('test-key-1', mockQueryFn, { table: 'test' })
    expect(mockQueryFn).toHaveBeenCalledTimes(4) // 3 initial + 1 after invalidation
  })

  test('should provide cache statistics', () => {
    const stats = cache.getStats()
    expect(stats).toHaveProperty('hits')
    expect(stats).toHaveProperty('misses')
    expect(stats).toHaveProperty('cacheSize')
    expect(stats).toHaveProperty('hitRate')
  })

  test('should cleanup expired entries', async () => {
    const mockQueryFn = jest.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Test' }],
      error: null
    })

    // Add entry with short TTL
    await cache.getWithCache('test-key', mockQueryFn, { table: 'test', ttl: 1 })
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Cleanup should remove expired entry
    const cleaned = cache.cleanup()
    expect(cleaned).toBe(1)
  })
})

describe('Cache Memory Management', () => {
  test('should evict LRU entries when cache is full', async () => {
    const smallCache = new SupabaseCache({ maxCacheSize: 2 })
    
    const mockQueryFn = jest.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 2 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 3 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })

    // Fill cache to capacity
    await smallCache.getWithCache('key1', mockQueryFn, { table: 'test' })
    await smallCache.getWithCache('key2', mockQueryFn, { table: 'test' })
    
    // Adding third entry should evict first (LRU)
    await smallCache.getWithCache('key3', mockQueryFn, { table: 'test' })
    
    // First key should be evicted, so this should call the function again
    await smallCache.getWithCache('key1', mockQueryFn, { table: 'test' })
    expect(mockQueryFn).toHaveBeenCalledTimes(4) // 3 initial + 1 after eviction
    
    smallCache.clear()
  })
})