async function readIndexed(page, store, id) {
  return page.evaluate(
    async ({ store, id }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('pageforge-library')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const get = (request) =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      try {
        const tx = db.transaction([store, 'sources', 'revisions'])
        const records = id
          ? [await get(tx.objectStore(store).get(id))]
          : await get(tx.objectStore(store).getAll())
        const values = await Promise.all(
          records.map(async (record) => {
            if (!record?.revisionIds) return record
            const documentId = record.documentId ?? record.id
            const nodes = await get(
              tx.objectStore('revisions').index('chain').getAll([documentId, record.id]),
            )
            const byId = new Map(nodes.map(({ documentId, chainId, ...node }) => [node.id, node]))
            const { revisionIds, ...metadata } = record
            const source =
              store === 'documents' ? await get(tx.objectStore('sources').get(record.id)) : {}
            return { ...metadata, ...source, revisions: revisionIds.map((key) => byId.get(key)) }
          }),
        )
        return id ? values[0] : values
      } finally {
        db.close()
      }
    },
    { store, id },
  )
}
module.exports = { readIndexed }
