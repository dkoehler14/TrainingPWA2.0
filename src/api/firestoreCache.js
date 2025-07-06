// Generic Firestore cache utility
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, query as fsQuery, where, orderBy as fsOrderBy, limit as fsLimit, startAt as fsStartAt, endAt as fsEndAt, startAfter as fsStartAfter, endBefore as fsEndBefore, collectionGroup } from 'firebase/firestore';

// In-memory cache
const cache = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(type, path, params) {
  return JSON.stringify({ type, path, params });
}

function isExpired(entry) {
  return entry && entry.expiry < Date.now();
}

// Generic getDocs with caching
export async function getCollectionCached(collectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('collection', collectionName, queryParams);
  const cached = cache.get(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }

  let q = collection(db, collectionName);
  const queryConstraints = [];

  // where
  if (queryParams.where) {
    queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
  }
  // orderBy
  if (queryParams.orderBy) {
    queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
  }
  // limit
  if (queryParams.limit) {
    queryConstraints.push(fsLimit(queryParams.limit));
  }
  // startAt
  if (queryParams.startAt) {
    queryConstraints.push(fsStartAt(queryParams.startAt));
  }
  // endAt
  if (queryParams.endAt) {
    queryConstraints.push(fsEndAt(queryParams.endAt));
  }
  // startAfter
  if (queryParams.startAfter) {
    queryConstraints.push(fsStartAfter(queryParams.startAfter));
  }
  // endBefore
  if (queryParams.endBefore) {
    queryConstraints.push(fsEndBefore(queryParams.endBefore));
  }

  if (queryConstraints.length > 0) {
    q = fsQuery(q, ...queryConstraints);
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  cache.set(cacheKey, { data, expiry: Date.now() + ttl });
  return data;
}

// Get collection group with caching
export async function getCollectionGroupCached(collectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('collectionGroup', collectionName, queryParams);
  const cached = cache.get(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }

  let q = collectionGroup(db, collectionName);
  const queryConstraints = [];

  // where
  if (queryParams.where) {
    queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
  }
  // orderBy
  if (queryParams.orderBy) {
    queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
  }
  // limit
  if (queryParams.limit) {
    queryConstraints.push(fsLimit(queryParams.limit));
  }
  // startAt
  if (queryParams.startAt) {
    queryConstraints.push(fsStartAt(queryParams.startAt));
  }
  // endAt
  if (queryParams.endAt) {
    queryConstraints.push(fsEndAt(queryParams.endAt));
  }
  // startAfter
  if (queryParams.startAfter) {
    queryConstraints.push(fsStartAfter(queryParams.startAfter));
  }
  // endBefore
  if (queryParams.endBefore) {
    queryConstraints.push(fsEndBefore(queryParams.endBefore));
  }

  if (queryConstraints.length > 0) {
    q = fsQuery(q, ...queryConstraints);
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  cache.set(cacheKey, { data, expiry: Date.now() + ttl });
  return data;
}

// Get subcollection with caching
export async function getSubcollectionCached(parentPath, subcollectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('subcollection', `${parentPath}/${subcollectionName}`, queryParams);
  const cached = cache.get(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }

  let q = collection(db, ...parentPath.split('/'), subcollectionName);
  const queryConstraints = [];

  // where
  if (queryParams.where) {
    queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
  }
  // orderBy
  if (queryParams.orderBy) {
    queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
  }
  // limit
  if (queryParams.limit) {
    queryConstraints.push(fsLimit(queryParams.limit));
  }
  // startAt
  if (queryParams.startAt) {
    queryConstraints.push(fsStartAt(queryParams.startAt));
  }
  // endAt
  if (queryParams.endAt) {
    queryConstraints.push(fsEndAt(queryParams.endAt));
  }
  // startAfter
  if (queryParams.startAfter) {
    queryConstraints.push(fsStartAfter(queryParams.startAfter));
  }
  // endBefore
  if (queryParams.endBefore) {
    queryConstraints.push(fsEndBefore(queryParams.endBefore));
  }

  if (queryConstraints.length > 0) {
    q = fsQuery(q, ...queryConstraints);
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  cache.set(cacheKey, { data, expiry: Date.now() + ttl });
  return data;
}

// Generic getDoc with caching
export async function getDocCached(collectionName, docId, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('doc', `${collectionName}/${docId}`);
  const cached = cache.get(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }
  const docRef = doc(db, collectionName, docId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  cache.set(cacheKey, { data, expiry: Date.now() + ttl });
  return data;
}

// Invalidate cache for a collection or document
export function invalidateCache(path) {
  for (const key of cache.keys()) {
    if (key.includes(path)) {
      cache.delete(key);
    }
  }
} 