# Yapay zekâ modelleri ve çalıştırıcı — lisanslar

Bu klasördeki modeller ve `vendor/ort/` cihazda (telefonda) çalışır; hiçbir sunucuya veri gönderilmez.

| Dosya | Kaynak | Lisans |
|---|---|---|
| `depth-anything-v2-small-q8.onnx` | Depth Anything V2 Small (onnx-community/depth-anything-v2-small, `model_quantized.onnx`) | Apache-2.0 |
| `ultraface-rfb-320.onnx` | Ultra-Light-Fast-Generic-Face-Detector-1MB (Linzaer), `version-RFB-320.onnx` | MIT, © 2019 linzai |
| `migan-pipeline-v2.onnx` | MI-GAN (Picsart AI Research), `andraniksargsyan/migan` → `migan_pipeline_v2.onnx` | MIT, © 2024 Picsart AI Research (PAIR) |
| `modnet-q8.onnx` | MODNet (ZHKKKe), `Xenova/modnet` → `onnx/model_quantized.onnx` | Apache-2.0 |
| `isnet-general-use-q8.onnx` | IS-Net / DIS (xuebinqin), `SacredNoir/isnet-general-use-onnx` → `isnet-general-use-q8.onnx` | Apache-2.0 |
| `../vendor/ort/*` | ONNX Runtime Web 1.31.1 (`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.*`) | MIT, © Microsoft Corporation |

Derinlik modeli ön işleme: RGB, 0..1, ImageNet ortalama [0.485, 0.456, 0.406] / sapma [0.229, 0.224, 0.225],
boyutlar 14'ün katı. Çıktı göreli ters derinliktir (büyük = yakın).

MI-GAN: girdi `image` uint8 [1,3,H,W], `mask` uint8 [1,1,H,W] (255 = koru, 0 = doldur); maskenin çevresinden
128 px pay alıp 512'de doldurur. MODNet: kısa kenar 512, 32'nin katı, (x/255 − 0,5)/0,5. IS-Net: 1024×1024,
x/255 − 0,5; çıktı en küçük–en büyük ile 0..1'e yayılır.
