Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path ".").Path
$logoPath = Join-Path $root "build\icons\Hinterland_Logo.jpg"
$outPng = Join-Path $root "build\icons\icon.png"
$outAssetsPng = Join-Path $root "src\ui\assets\icon.png"
$outIco = Join-Path $root "build\icons\icon.ico"

if (-not (Test-Path $logoPath)) {
    Write-Error "Logo not found at $logoPath"
    exit 1
}

$src = [System.Drawing.Bitmap]::FromFile($logoPath)

# Content bounds: center of bird is at (766, 574)
$cx = 766
$cy = 574
$canvasSize = 1680
$half = $canvasSize / 2
$srcX = [int]($cx - $half)
$srcY = [int]($cy - $half)
$srcRect = New-Object System.Drawing.Rectangle($srcX, $srcY, $canvasSize, $canvasSize)

function CreateCircularBadge([int]$targetSize) {
    $bmp = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Max(1.0, $targetSize * 0.015)
    $diameter = $targetSize - (2 * $margin)
    $circlePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $circlePath.AddEllipse([float]$margin, [float]$margin, [float]$diameter, [float]$diameter)

    $g.SetClip($circlePath)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 33, 33, 33))

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $targetSize, $targetSize)
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetClip()

    $penWidth = [Math]::Max(1.0, [float]($targetSize * 0.003))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 255, 255, 255), $penWidth)
    $g.DrawEllipse($pen, [float]($margin + 0.5), [float]($margin + 0.5), [float]($diameter - 1.0), [float]($diameter - 1.0))
    $pen.Dispose()

    $circlePath.Dispose()
    $g.Dispose()
    return $bmp
}

# 1. Save 512x512 icon.png
$bmp512 = CreateCircularBadge 512
$bmp512.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created $outPng"
if (Test-Path (Split-Path $outAssetsPng)) {
    $bmp512.Save($outAssetsPng, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created $outAssetsPng"
}

# 2. Build multi-resolution ICO (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    $bmpSz = CreateCircularBadge $sz
    $ms = New-Object System.IO.MemoryStream
    $bmpSz.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpSz.Dispose()
    $pngStreams += $ms
}

# Write ICO binary
$fs = [System.IO.File]::Create($outIco)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR header
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type 1 = ICO
$bw.Write([uint16]$sizes.Count) # Image count

$offset = 6 + ($sizes.Count * 16)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]
    $dataLen = [uint32]$pngStreams[$i].Length

    $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $hByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $bw.Write($wByte)          # Width
    $bw.Write($hByte)          # Height
    $bw.Write([byte]0)         # Colors
    $bw.Write([byte]0)         # Reserved
    $bw.Write([uint16]1)       # Color planes
    $bw.Write([uint16]32)      # Bits per pixel
    $bw.Write($dataLen)        # Image size in bytes
    $bw.Write([uint32]$offset) # Offset to data

    $offset += $dataLen
}

# Write image data chunks
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bytes = $pngStreams[$i].ToArray()
    $bw.Write($bytes)
    $pngStreams[$i].Dispose()
}

$bw.Flush()
$bw.Close()
$fs.Close()
$bmp512.Dispose()
$src.Dispose()

Write-Host "Created $outIco successfully with sizes: $($sizes -join ', ')"
