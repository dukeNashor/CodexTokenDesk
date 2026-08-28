param(
    [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) "assets\tray")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$logicalSize = 16
$dark = [System.Drawing.Color]::FromArgb(45, 41, 36)
$cream = [System.Drawing.Color]::FromArgb(242, 237, 228)
$emerald = [System.Drawing.Color]::FromArgb(59, 139, 120)
$states = [ordered]@{
    running  = [System.Drawing.Color]::FromArgb(98, 207, 144)
    starting = [System.Drawing.Color]::FromArgb(90, 181, 231)
    stopping = [System.Drawing.Color]::FromArgb(230, 182, 78)
    faulted  = [System.Drawing.Color]::FromArgb(238, 103, 94)
    stopped  = [System.Drawing.Color]::FromArgb(105, 115, 114)
}

function New-ContextHaloBitmap {
    param(
        [System.Drawing.Color]$StatusColor,
        [int]$Scale = 1
    )

    $bitmap = [System.Drawing.Bitmap]::new(
        $logicalSize * $Scale,
        $logicalSize * $Scale,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)

        for ($y = 0; $y -lt $logicalSize; $y++) {
            for ($x = 0; $x -lt $logicalSize; $x++) {
                $dx = $x - 7.5
                $dy = $y - 7.5
                $distanceSquared = $dx * $dx + $dy * $dy
                $color = [System.Drawing.Color]::Transparent

                if ($distanceSquared -le 44) {
                    if ($distanceSquared -ge 34) {
                        $color = $dark
                    }
                    elseif ($distanceSquared -ge 24) {
                        $color = if ($y -gt $x) { $emerald } else { $cream }
                    }
                    elseif ($distanceSquared -ge 16) {
                        $color = $cream
                    }
                    else {
                        $color = $dark
                    }
                }

                # A three-pixel status tile replaces the lower-right ring segment.
                if ($x -ge 12 -and $x -le 14 -and $y -ge 12 -and $y -le 14) {
                    $color = if ($x -eq 13 -and $y -eq 13) { $StatusColor } else { $dark }
                }

                if ($color.A -ne 0) {
                    $brush = [System.Drawing.SolidBrush]::new($color)
                    try {
                        $graphics.FillRectangle($brush, $x * $Scale, $y * $Scale, $Scale, $Scale)
                    }
                    finally {
                        $brush.Dispose()
                    }
                }
            }
        }
    }
    finally {
        $graphics.Dispose()
    }

    return $bitmap
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

foreach ($entry in $states.GetEnumerator()) {
    $bitmap = New-ContextHaloBitmap -StatusColor $entry.Value
    try {
        $path = Join-Path $OutputDirectory ("context-halo-{0}-16.png" -f $entry.Key)
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $bitmap.Dispose()
    }
}

$preview = [System.Drawing.Bitmap]::new(700, 320, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$previewGraphics = [System.Drawing.Graphics]::FromImage($preview)
try {
    $previewGraphics.Clear([System.Drawing.Color]::FromArgb(242, 237, 228))
    $darkBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(31, 36, 37))
    $lightText = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(242, 237, 228))
    $darkText = [System.Drawing.SolidBrush]::new($dark)
    $font = [System.Drawing.Font]::new("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    try {
        $previewGraphics.FillRectangle($darkBackground, 0, 160, 700, 160)
        $index = 0
        foreach ($entry in $states.GetEnumerator()) {
            $x = 20 + $index * 136
            $zoomed = New-ContextHaloBitmap -StatusColor $entry.Value -Scale 6
            $actual = New-ContextHaloBitmap -StatusColor $entry.Value
            try {
                $previewGraphics.DrawString($entry.Key, $font, $darkText, $x, 8)
                $previewGraphics.DrawImageUnscaled($zoomed, $x, 34)
                $previewGraphics.DrawImageUnscaled($actual, $x + 106, 108)
                $previewGraphics.DrawString($entry.Key, $font, $lightText, $x, 168)
                $previewGraphics.DrawImageUnscaled($zoomed, $x, 194)
                $previewGraphics.DrawImageUnscaled($actual, $x + 106, 268)
            }
            finally {
                $actual.Dispose()
                $zoomed.Dispose()
            }
            $index++
        }
    }
    finally {
        $font.Dispose()
        $darkText.Dispose()
        $lightText.Dispose()
        $darkBackground.Dispose()
    }

    $previewPath = Join-Path $OutputDirectory "context-halo-preview.png"
    $preview.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $previewGraphics.Dispose()
    $preview.Dispose()
}

Write-Host "Generated tray icons in $OutputDirectory"
