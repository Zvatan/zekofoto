# Yapay zekâ modelleri ve çalıştırıcı — lisanslar

Bu klasördeki modeller ve `vendor/ort/` cihazda (telefonda) çalışır; hiçbir sunucuya veri gönderilmez.

| Dosya | Kaynak | Lisans |
|---|---|---|
| `depth-anything-v2-small-q8.onnx` | Depth Anything V2 Small (onnx-community/depth-anything-v2-small, `model_quantized.onnx`) | Apache-2.0 |
| `ultraface-rfb-320.onnx` | Ultra-Light-Fast-Generic-Face-Detector-1MB (Linzaer), `version-RFB-320.onnx` | MIT, © 2019 linzai |
| `../vendor/ort/*` | ONNX Runtime Web 1.31.1 (`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.*`) | MIT, © Microsoft Corporation |

Derinlik modeli ön işleme: RGB, 0..1, ImageNet ortalama [0.485, 0.456, 0.406] / sapma [0.229, 0.224, 0.225],
boyutlar 14'ün katı. Çıktı göreli ters derinliktir (büyük = yakın).
