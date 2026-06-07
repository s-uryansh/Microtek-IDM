const FORMAT_LABELS = {
  qr_code: "QR",
  code_128: "Code128",
  code_39: "Code39",
  ean_13: "EAN13",
  upc_a: "UPC-A",
  upc_e: "UPC-E"
};

function getStatusText(status, error) {
  if (status === "scanning") return "Camera scanning active";
  if (status === "starting") return "Starting camera...";
  if (status === "paused") return "Camera paused";
  if (status === "unsupported") return "Camera scanning is not supported in this browser";
  if (status === "permission-denied") return error || "Camera permission denied";
  if (status === "unavailable") return error || "Camera unavailable";
  if (status === "error") return error || "Camera unavailable";
  return "Camera ready";
}

export function ScanCamera({
  scanner,
  disabled = false,
  formats = ["qr_code", "code_128", "code_39", "ean_13", "upc_a"]
}) {
  const activeFormats = scanner.supportedFormats?.length
    ? formats.filter((format) => scanner.supportedFormats.includes(format))
    : formats;
  const statusText = getStatusText(scanner.cameraStatus, scanner.cameraError);
  const isScanning = scanner.cameraStatus === "scanning";
  const isPaused = scanner.cameraStatus === "paused";
  const shouldRetry = ["permission-denied", "unavailable", "error", "unsupported"].includes(scanner.cameraStatus);

  return (
    <section className="scan-camera" aria-label="Camera scanner">
      <div className="scan-camera__viewport">
        <video
          ref={scanner.videoRef}
          className="scan-camera__video"
          muted
          playsInline
          aria-label="Camera preview"
        />
        {!isScanning && (
          <div className="scan-camera__overlay">
            <span>{statusText}</span>
          </div>
        )}
      </div>

      <div className="scan-camera__controls">
        {!isScanning && !isPaused && (
          <button className="button button--primary scan-camera__button" type="button" onClick={scanner.startCamera} disabled={disabled}>
            {shouldRetry ? "Retry Camera" : "Start Camera"}
          </button>
        )}
        {isScanning && (
          <button className="button button--secondary scan-camera__button" type="button" onClick={scanner.pauseCamera}>
            Pause
          </button>
        )}
        {isPaused && (
          <button className="button button--primary scan-camera__button" type="button" onClick={scanner.resumeCamera}>
            Resume
          </button>
        )}
        {(isScanning || isPaused) && (
          <button className="button button--secondary scan-camera__button" type="button" onClick={scanner.stopCamera}>
            Stop
          </button>
        )}
      </div>

      <p className="scan-camera__status" role={["error", "permission-denied", "unavailable", "unsupported"].includes(scanner.cameraStatus) ? "alert" : "status"}>
        {statusText}
      </p>
      <p className="scan-camera__formats">
        {activeFormats.map((format) => FORMAT_LABELS[format] || format).join(" / ")}
      </p>
    </section>
  );
}
