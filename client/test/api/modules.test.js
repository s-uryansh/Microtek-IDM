import { describe, expect, test, vi, beforeEach } from "vitest";
import { fetchAgeingReport } from "../../src/api/modules/ageing.js";
import { commitBatterySerial } from "../../src/api/modules/battery.js";
import * as dispatchModule from "../../src/api/modules/dispatch.js";
import { createDispatch, scanDispatchSerial, completeDispatch } from "../../src/api/modules/dispatch.js";
import { fetchExceptions, correctException } from "../../src/api/modules/exceptions.js";
import { fetchFulfilmentStatus } from "../../src/api/modules/fulfilment.js";
import { createGrn, scanGrnSerial, completeGrn } from "../../src/api/modules/grn.js";
import { fetchSerialHistory } from "../../src/api/modules/history.js";
import { importProduction } from "../../src/api/modules/imports.js";
import * as srnModule from "../../src/api/modules/srn.js";
import { createSrn, scanSrnSerial } from "../../src/api/modules/srn.js";
import { validateSerial } from "../../src/api/modules/validation.js";

vi.mock("../../src/api/client.js", () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    get: mockGet,
    post: mockPost,
    __mockGet: mockGet,
    __mockPost: mockPost
  };
});

const mockClient = await import("../../src/api/client.js");

describe("API modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ageing", () => {
    test("fetchAgeingReport calls GET with warehouseId", async () => {
      mockClient.__mockGet.mockResolvedValue({ summary: [] });
      await fetchAgeingReport({ warehouseId: 3 });
      expect(mockClient.__mockGet).toHaveBeenCalledWith(
        expect.stringContaining("warehouseId=3"),
        expect.any(Object)
      );
    });
  });

  describe("battery", () => {
    test("commitBatterySerial calls POST with invoiceLineId and serialNo", async () => {
      mockClient.__mockPost.mockResolvedValue({ valid: true, status: "COMMITTED" });
      await commitBatterySerial({ invoiceLineId: 1, serialNo: "TEST-001" });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-03/battery/commit",
        { invoiceLineId: 1, serialNo: "TEST-001" },
        expect.any(Object)
      );
    });
  });

  describe("dispatch", () => {
    test("does not export unsupported read helper", () => {
      expect(dispatchModule.getDispatch).toBeUndefined();
    });

    test("createDispatch calls POST", async () => {
      mockClient.__mockPost.mockResolvedValue({ dispatchId: 1 });
      await createDispatch({ invoiceId: 1, warehouseId: 3 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-05/dispatches",
        { invoiceId: 1, warehouseId: 3 },
        expect.any(Object)
      );
    });

    test("scanDispatchSerial calls POST with correct path", async () => {
      mockClient.__mockPost.mockResolvedValue({ valid: true });
      await scanDispatchSerial({ dispatchId: 1, invoiceLineId: 1, serialNo: "S-001" });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-05/dispatches/1/scans",
        { invoiceLineId: 1, serialNo: "S-001" },
        expect.any(Object)
      );
    });

    test("completeDispatch calls POST", async () => {
      mockClient.__mockPost.mockResolvedValue({ completed: true });
      await completeDispatch({ dispatchId: 1 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-05/dispatches/1/complete",
        {},
        expect.any(Object)
      );
    });
  });

  describe("exceptions", () => {
    test("fetchExceptions calls GET with pagination", async () => {
      mockClient.__mockGet.mockResolvedValue({ exceptions: [], total: 0 });
      await fetchExceptions({ page: 1, pageSize: 10 });
      expect(mockClient.__mockGet).toHaveBeenCalledWith(
        expect.stringContaining("page=1"),
        expect.any(Object)
      );
    });

    test("correctException calls POST with reason", async () => {
      mockClient.__mockPost.mockResolvedValue({ status: "CORRECTED" });
      await correctException({ exceptionId: 1, correctionReason: "Valid" });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-10/exceptions/1/correct",
        { correctionReason: "Valid" },
        expect.any(Object)
      );
    });
  });

  describe("fulfilment", () => {
    test("fetchFulfilmentStatus calls GET with invoiceId", async () => {
      mockClient.__mockGet.mockResolvedValue({ status: "PENDING" });
      await fetchFulfilmentStatus({ invoiceId: 1 });
      expect(mockClient.__mockGet).toHaveBeenCalledWith(
        "/idm-07/orders/1/status",
        expect.any(Object)
      );
    });
  });

  describe("grn", () => {
    test("createGrn calls POST", async () => {
      mockClient.__mockPost.mockResolvedValue({ grnId: 1 });
      await createGrn({ sapDispatchDocId: 1, warehouseId: 3 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-02/grns",
        { sapDispatchDocId: 1, warehouseId: 3 },
        expect.any(Object)
      );
    });

    test("scanGrnSerial calls POST with correct path", async () => {
      mockClient.__mockPost.mockResolvedValue({ valid: true, matchStatus: "MATCHED" });
      await scanGrnSerial({ grnId: 1, serialNo: "S-001" });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-02/grns/1/scans",
        { serialNo: "S-001" },
        expect.any(Object)
      );
    });

    test("completeGrn calls POST", async () => {
      mockClient.__mockPost.mockResolvedValue({ grnId: 1, status: "MATCHED" });
      await completeGrn({ grnId: 1 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-02/grns/1/complete",
        {},
        expect.any(Object)
      );
    });
  });

  describe("history", () => {
    test("fetchSerialHistory calls GET with encoded serial", async () => {
      mockClient.__mockGet.mockResolvedValue({ found: true, timeline: [] });
      await fetchSerialHistory({ serialNo: "DEMO-001" });
      expect(mockClient.__mockGet).toHaveBeenCalledWith(
        "/idm-09/serials/DEMO-001/history",
        expect.any(Object)
      );
    });
  });

  describe("imports", () => {
    test("importProduction calls POST with records", async () => {
      mockClient.__mockPost.mockResolvedValue({ status: "PROCESSED" });
      await importProduction({ externalRef: "REF-1", source: "SAP", records: [{ serialNo: "S-001", productCode: "P-1" }] });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-01/import/production",
        { externalRef: "REF-1", source: "SAP", records: [{ serialNo: "S-001", productCode: "P-1" }] },
        expect.any(Object)
      );
    });
  });

  describe("srn", () => {
    test("does not export unsupported read helper", () => {
      expect(srnModule.getSrn).toBeUndefined();
    });

    test("createSrn calls POST", async () => {
      mockClient.__mockPost.mockResolvedValue({ srnId: 1 });
      await createSrn({ warehouseId: 3 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-04/srns",
        { warehouseId: 3 },
        expect.any(Object)
      );
    });

    test("scanSrnSerial calls POST with conditionTag", async () => {
      mockClient.__mockPost.mockResolvedValue({ valid: true });
      await scanSrnSerial({ srnId: 1, serialNo: "S-001", conditionTag: "SALEABLE" });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-04/srns/1/scans",
        { serialNo: "S-001", conditionTag: "SALEABLE" },
        expect.any(Object)
      );
    });
  });

  describe("validation", () => {
    test("validateSerial calls POST with context", async () => {
      mockClient.__mockPost.mockResolvedValue({ valid: true });
      await validateSerial({ serialNo: "S-001", contextType: "GRN", warehouseId: 3 });
      expect(mockClient.__mockPost).toHaveBeenCalledWith(
        "/idm-06/validate",
        expect.objectContaining({
          serialNo: "S-001",
          contextType: "GRN",
          warehouseId: 3
        }),
        expect.any(Object)
      );
    });
  });
});
