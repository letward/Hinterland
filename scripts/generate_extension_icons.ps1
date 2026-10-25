Add-Type -AssemblyName System.Drawing

function Create-FocusIcon([int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = [float]($size / 128.0)

    # Draw rounded background badge
    $bx = [float](4.0 * $scale)
    $by = [float](4.0 * $scale)
    $bw = [float](120.0 * $scale)
    $bh = [float](120.0 * $scale)
    $radius = [float](28.0 * $scale)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($bx, $by, [float]($radius * 2), [float]($radius * 2), 180, 90)
    $path.AddArc([float]($bx + $bw - $radius * 2), $by, [float]($radius * 2), [float]($radius * 2), 270, 90)
    $path.AddArc([float]($bx + $bw - $radius * 2), [float]($by + $bh - $radius * 2), [float]($radius * 2), [float]($radius * 2), 0, 90)
    $path.AddArc($bx, [float]($by + $bh - $radius * 2), [float]($radius * 2), [float]($radius * 2), 90, 90)
    $path.CloseFigure()

    $p1 = New-Object System.Drawing.PointF 0, 0
    $p2 = New-Object System.Drawing.PointF ([float]$size), ([float]$size)
    $c1 = [System.Drawing.Color]::FromArgb(255, 30, 41, 59)
    $c2 = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $c1, $c2
    $g.FillPath($bgBrush, $path)

    # Border outline
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 99, 102, 241)), ([float][Math]::Max(1.0, 3.0 * $scale))
    $g.DrawPath($borderPen, $path)

    # Focus Mode Symbol: Concentric target rings + center dot
    $center = [float]($size / 2.0)
    $ring1R = [float](36.0 * $scale)
    $ringPen1 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 129, 140, 248)), ([float][Math]::Max(1.2, 5.0 * $scale))
    $g.DrawEllipse($ringPen1, [float]($center - $ring1R), [float]($center - $ring1R), [float]($ring1R * 2), [float]($ring1R * 2))

    $ring2R = [float](22.0 * $scale)
    $ringPen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 199, 210, 254)), ([float][Math]::Max(1.0, 4.0 * $scale))
    $g.DrawEllipse($ringPen2, [float]($center - $ring2R), [float]($center - $ring2R), [float]($ring2R * 2), [float]($ring2R * 2))

    $dotR = [float](8.0 * $scale)
    $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillEllipse($dotBrush, [float]($center - $dotR), [float]($center - $dotR), [float]($dotR * 2), [float]($dotR * 2))

    # Crosshairs on outer ring
    $chPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 99, 102, 241)), ([float][Math]::Max(1.0, 4.0 * $scale))
    $chLen = [float](14.0 * $scale)
    $g.DrawLine($chPen, $center, [float]($center - $ring1R - $chLen/2), $center, [float]($center - $ring1R + $chLen/2))
    $g.DrawLine($chPen, $center, [float]($center + $ring1R - $chLen/2), $center, [float]($center + $ring1R + $chLen/2))
    $g.DrawLine($chPen, [float]($center - $ring1R - $chLen/2), $center, [float]($center - $ring1R + $chLen/2), $center)
    $g.DrawLine($chPen, [float]($center + $ring1R - $chLen/2), $center, [float]($center + $ring1R + $chLen/2), $center)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $chPen.Dispose()
    $dotBrush.Dispose()
    $ringPen2.Dispose()
    $ringPen1.Dispose()
    $borderPen.Dispose()
    $bgBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

function Create-PanelIcon([int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = [float]($size / 128.0)

    # Draw rounded background badge
    $bx = [float](4.0 * $scale)
    $by = [float](4.0 * $scale)
    $bw = [float](120.0 * $scale)
    $bh = [float](120.0 * $scale)
    $radius = [float](28.0 * $scale)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($bx, $by, [float]($radius * 2), [float]($radius * 2), 180, 90)
    $path.AddArc([float]($bx + $bw - $radius * 2), $by, [float]($radius * 2), [float]($radius * 2), 270, 90)
    $path.AddArc([float]($bx + $bw - $radius * 2), [float]($by + $bh - $radius * 2), [float]($radius * 2), [float]($radius * 2), 0, 90)
    $path.AddArc($bx, [float]($by + $bh - $radius * 2), [float]($radius * 2), [float]($radius * 2), 90, 90)
    $path.CloseFigure()

    $p1 = New-Object System.Drawing.PointF 0, 0
    $p2 = New-Object System.Drawing.PointF ([float]$size), ([float]$size)
    $c1 = [System.Drawing.Color]::FromArgb(255, 6, 78, 59)
    $c2 = [System.Drawing.Color]::FromArgb(255, 4, 47, 46)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $c1, $c2
    $g.FillPath($bgBrush, $path)

    # Border outline
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 20, 184, 166)), ([float][Math]::Max(1.0, 3.0 * $scale))
    $g.DrawPath($borderPen, $path)

    # Panel Layout Symbol: Window frame with top header bar + main content + right side panel
    $winX = [float](24.0 * $scale)
    $winY = [float](24.0 * $scale)
    $winW = [float](80.0 * $scale)
    $winH = [float](80.0 * $scale)
    $winRadius = [float](10.0 * $scale)

    $winPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $winPath.AddArc($winX, $winY, [float]($winRadius * 2), [float]($winRadius * 2), 180, 90)
    $winPath.AddArc([float]($winX + $winW - $winRadius * 2), $winY, [float]($winRadius * 2), [float]($winRadius * 2), 270, 90)
    $winPath.AddArc([float]($winX + $winW - $winRadius * 2), [float]($winY + $winH - $winRadius * 2), [float]($winRadius * 2), [float]($winRadius * 2), 0, 90)
    $winPath.AddArc($winX, [float]($winY + $winH - $winRadius * 2), [float]($winRadius * 2), [float]($winRadius * 2), 90, 90)
    $winPath.CloseFigure()

    $winPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), ([float][Math]::Max(1.2, 4.0 * $scale))
    $g.DrawPath($winPen, $winPath)

    # Top header bar divider
    $headerY = [float]($winY + 22.0 * $scale)
    $g.DrawLine($winPen, $winX, $headerY, [float]($winX + $winW), $headerY)

    # Side panel divider (vertical line)
    $panelX = [float]($winX + 48.0 * $scale)
    $g.DrawLine($winPen, $panelX, $headerY, $panelX, [float]($winY + $winH))

    # Fill side panel with accent tint
    $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 45, 212, 191))
    $g.FillRectangle($panelBrush, [float]($panelX + 1.5 * $scale), [float]($headerY + 1.5 * $scale), [float]($winX + $winW - $panelX - 3.0 * $scale), [float]($winY + $winH - $headerY - 3.0 * $scale))

    # Content skeleton lines in main area
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 204, 251, 241)), ([float][Math]::Max(1.0, 3.0 * $scale))
    $line1Y = [float]($headerY + 16.0 * $scale)
    $line2Y = [float]($headerY + 30.0 * $scale)
    $line3Y = [float]($headerY + 44.0 * $scale)
    $g.DrawLine($linePen, [float]($winX + 8.0 * $scale), $line1Y, [float]($panelX - 8.0 * $scale), $line1Y)
    $g.DrawLine($linePen, [float]($winX + 8.0 * $scale), $line2Y, [float]($panelX - 8.0 * $scale), $line2Y)
    $g.DrawLine($linePen, [float]($winX + 8.0 * $scale), $line3Y, [float]($panelX - 16.0 * $scale), $line3Y)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $linePen.Dispose()
    $panelBrush.Dispose()
    $winPen.Dispose()
    $winPath.Dispose()
    $borderPen.Dispose()
    $bgBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$sizes = @(16, 32, 48, 128)

$focusDir = "src/extensions/hinterlandFocus/icons"
if (-not (Test-Path $focusDir)) { New-Item -ItemType Directory -Path $focusDir -Force }
foreach ($s in $sizes) {
    $p = "$focusDir/icon$s.png"
    Create-FocusIcon $s $p
    Write-Host "Created $p"
}

$panelDir = "src/extensions/hinterlandPanel/icons"
if (-not (Test-Path $panelDir)) { New-Item -ItemType Directory -Path $panelDir -Force }
foreach ($s in $sizes) {
    $p = "$panelDir/icon$s.png"
    Create-PanelIcon $s $p
    Write-Host "Created $p"
}
