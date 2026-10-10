/**
 * @file gpu_check.js
 * Hardware & WebGPU detection utility mirroring rag-poc's gpuCheck.
 * Safely inspects navigator.gpu, requests adapters, and inspects limits and architecture.
 */

/**
 * Checks for WebGPU support, requests an adapter, and extracts adapter details and limits.
 * @param {Object} [nav=typeof navigator !== 'undefined' ? navigator : undefined] - Optional navigator override for testing
 * @returns {Promise<{
 *   supported: boolean,
 *   adapterName?: string,
 *   details?: {
 *     vendor?: string,
 *     architecture?: string,
 *     device?: string,
 *     description?: string,
 *     isFallbackAdapter?: boolean,
 *     maxBufferSize?: number,
 *     maxComputeWorkgroupStorageSize?: number,
 *     maxStorageBufferBindingSize?: number,
 *     [key: string]: any
 *   },
 *   reason?: string
 * }>}
 */
export async function checkWebGPUSupport(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!nav || !nav.gpu) {
    return {
      supported: false,
      reason: 'WebGPU is not supported by your browser or platform. Please use Chrome 113+, Edge 113+, or a modern WebGPU-enabled browser.'
    };
  }

  try {
    const adapter = await nav.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      return {
        supported: false,
        reason: 'No WebGPU adapter found or requestAdapter() returned null. Hardware acceleration may be disabled.'
      };
    }

    const details = {
      isFallbackAdapter: Boolean(adapter.isFallbackAdapter)
    };

    // Extract adapter limits if present
    if (adapter.limits) {
      details.maxBufferSize = adapter.limits.maxBufferSize;
      details.maxComputeWorkgroupStorageSize = adapter.limits.maxComputeWorkgroupStorageSize;
      details.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
      details.maxComputeInvocationsPerWorkgroup = adapter.limits.maxComputeInvocationsPerWorkgroup;
    }

    // Extract adapter info if available (requestAdapterInfo or adapter.info)
    let adapterName = 'Standard WebGPU Device';

    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        const info = await adapter.requestAdapterInfo();
        if (info) {
          details.vendor = info.vendor || '';
          details.architecture = info.architecture || '';
          details.device = info.device || '';
          details.description = info.description || '';

          const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean);
          if (parts.length > 0) {
            adapterName = parts.join(' - ');
          }
        }
      } catch (infoErr) {
        // requestAdapterInfo may be restricted in some browser security contexts
      }
    } else if (adapter.info) {
      const info = adapter.info;
      details.vendor = info.vendor || '';
      details.architecture = info.architecture || '';
      details.device = info.device || '';
      details.description = info.description || '';

      const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean);
      if (parts.length > 0) {
        adapterName = parts.join(' - ');
      }
    }

    return {
      supported: true,
      adapterName,
      details
    };
  } catch (err) {
    return {
      supported: false,
      reason: `WebGPU adapter initialization failed: ${err.message || String(err)}`
    };
  }
}
