import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  listBatches,
  getBatch,
  importProduction,
  fetchAgeingSummary
} from "../../src/api/modules/importMonitor.js";

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

describe("importMonitor API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listBatches", () => {
    test("includes limit, offset and sourceLabel query params when provided", async () => {
      mockClient.__mockGet.mockResolvedValue({ batches: [] });
      const signal = new AbortController().signal;
      await listBatches({ limit: 25, offset: 50, sourceLabel: "SAP", signal });

      const [url, opts] = mockClient.__mockGet.mock.calls[0];
      expect(url).toContain("limit=25");
      expect(url).toContain("offset=50");
      expect(url).toContain("sourceLabel=SAP");
      expect(opts).toEqual({ signal });
    });

    test("omits falsy params and works with no arguments", async () => {
      mockClient.__mockGet.mockResolvedValue({ batches: [] });
      await listBatches();

      const [url] = mockClient.__mockGet.mock.calls[0];
      expect(url).toBe("/idm-01/import/batches?");
    });
  });

  test("getBatch GETs the batch by id and forwards the signal", async () => {
    mockClient.__mockGet.mockResolvedValue({ batchId: 7 });
    const signal = new AbortController().signal;
    await getBatch(7, { signal });
    expect(mockClient.__mockGet).toHaveBeenCalledWith("/idm-01/import/batches/7", { signal });
  });

  test("importProduction POSTs externalRef, source and records", async () => {
    mockClient.__mockPost.mockResolvedValue({ accepted: 2 });
    const payload = { externalRef: "EXT-1", source: "SAP", records: [{ a: 1 }] };
    await importProduction(payload);
    expect(mockClient.__mockPost).toHaveBeenCalledWith(
      "/idm-01/import/production",
      { externalRef: "EXT-1", source: "SAP", records: [{ a: 1 }] },
      { signal: undefined }
    );
  });

  test("fetchAgeingSummary GETs the ageing summary endpoint", async () => {
    mockClient.__mockGet.mockResolvedValue({ summary: [] });
    await fetchAgeingSummary();
    expect(mockClient.__mockGet).toHaveBeenCalledWith("/idm-08/ageing/summary", { signal: undefined });
  });
});
