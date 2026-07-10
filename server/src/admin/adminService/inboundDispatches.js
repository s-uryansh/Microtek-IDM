export function createInboundDispatchService({ adminRepo }) {
  return {
    /*
       INBOUND STOCK — which stock was sent to which warehouse
       (SAP dispatch documents + their serials)
*/

    async listInboundDispatches() {
      const docs = await adminRepo.listDispatchDocs();
      const lines = await adminRepo.dispatchDocLines(docs.map((doc) => doc.sapDispatchDocId));

      const linesByDoc = {};
      for (const line of lines) {
        (linesByDoc[line.sapDispatchDocId] ||= []).push(line);
      }

      return docs.map((doc) => {
        const docLines = linesByDoc[doc.sapDispatchDocId] || [];
        // Per-product roll-up: name/code with quantity (serial count).
        const productMap = new Map();
        for (const line of docLines) {
          const entry = productMap.get(line.productCode) || {
            productCode: line.productCode,
            productName: line.productName,
            quantity: 0
          };
          entry.quantity += 1;
          productMap.set(line.productCode, entry);
        }
        return {
          ...doc,
          totalQuantity: docLines.length,
          products: [...productMap.values()],
          lines: docLines
        };
      });
    }
  };
}
