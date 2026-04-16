Add-Type -AssemblyName System.Drawing

$path = $args[0]
if (-not $path) {
  $path = "frontend/public/assets/acessorios_nexus.png"
}

$resolved = Resolve-Path $path
$bmp = [System.Drawing.Bitmap]::FromFile($resolved)
$width = $bmp.Width
$height = $bmp.Height

$rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$lock = $bmp.LockBits(
  $rect,
  [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$bytes = New-Object byte[] ($lock.Stride * $height)
[System.Runtime.InteropServices.Marshal]::Copy($lock.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($lock)

$visited = New-Object byte[] ($width * $height)
$components = New-Object System.Collections.Generic.List[object]

for ($y = 0; $y -lt $height; $y++) {
  $rowOffset = $y * $lock.Stride
  for ($x = 0; $x -lt $width; $x++) {
    $idx = $y * $width + $x
    if ($visited[$idx] -ne 0) { continue }
    $offset = $rowOffset + ($x * 4)
    $b = $bytes[$offset]
    $g = $bytes[$offset + 1]
    $r = $bytes[$offset + 2]
    if ($r -ge 250 -and $g -ge 250 -and $b -ge 250) {
      $visited[$idx] = 1
      continue
    }

    $minX = $x; $maxX = $x; $minY = $y; $maxY = $y
    $area = 0
    $stack = New-Object System.Collections.Generic.Stack[int]
    $stack.Push($idx)
    $visited[$idx] = 1

    while ($stack.Count -gt 0) {
      $current = $stack.Pop()
      $cx = $current % $width
      $cy = [math]::Floor($current / $width)
      $area++
      if ($cx -lt $minX) { $minX = $cx }
      if ($cx -gt $maxX) { $maxX = $cx }
      if ($cy -lt $minY) { $minY = $cy }
      if ($cy -gt $maxY) { $maxY = $cy }

      if ($cx -gt 0) {
        $nx = $cx - 1; $ny = $cy
        $nidx = $ny * $width + $nx
        if ($visited[$nidx] -eq 0) {
          $noffset = $ny * $lock.Stride + ($nx * 4)
          $nb = $bytes[$noffset]
          $ng = $bytes[$noffset + 1]
          $nr = $bytes[$noffset + 2]
          if (!($nr -ge 250 -and $ng -ge 250 -and $nb -ge 250)) {
            $visited[$nidx] = 1
            $stack.Push($nidx)
          } else {
            $visited[$nidx] = 1
          }
        }
      }
      if ($cx -lt ($width - 1)) {
        $nx = $cx + 1; $ny = $cy
        $nidx = $ny * $width + $nx
        if ($visited[$nidx] -eq 0) {
          $noffset = $ny * $lock.Stride + ($nx * 4)
          $nb = $bytes[$noffset]
          $ng = $bytes[$noffset + 1]
          $nr = $bytes[$noffset + 2]
          if (!($nr -ge 250 -and $ng -ge 250 -and $nb -ge 250)) {
            $visited[$nidx] = 1
            $stack.Push($nidx)
          } else {
            $visited[$nidx] = 1
          }
        }
      }
      if ($cy -gt 0) {
        $nx = $cx; $ny = $cy - 1
        $nidx = $ny * $width + $nx
        if ($visited[$nidx] -eq 0) {
          $noffset = $ny * $lock.Stride + ($nx * 4)
          $nb = $bytes[$noffset]
          $ng = $bytes[$noffset + 1]
          $nr = $bytes[$noffset + 2]
          if (!($nr -ge 250 -and $ng -ge 250 -and $nb -ge 250)) {
            $visited[$nidx] = 1
            $stack.Push($nidx)
          } else {
            $visited[$nidx] = 1
          }
        }
      }
      if ($cy -lt ($height - 1)) {
        $nx = $cx; $ny = $cy + 1
        $nidx = $ny * $width + $nx
        if ($visited[$nidx] -eq 0) {
          $noffset = $ny * $lock.Stride + ($nx * 4)
          $nb = $bytes[$noffset]
          $ng = $bytes[$noffset + 1]
          $nr = $bytes[$noffset + 2]
          if (!($nr -ge 250 -and $ng -ge 250 -and $nb -ge 250)) {
            $visited[$nidx] = 1
            $stack.Push($nidx)
          } else {
            $visited[$nidx] = 1
          }
        }
      }
    }

    if ($area -gt 500) {
      $components.Add([pscustomobject]@{
        x = $minX
        y = $minY
        w = ($maxX - $minX + 1)
        h = ($maxY - $minY + 1)
        area = $area
      })
    }
  }
}

$components |
  Sort-Object y, x |
  ForEach-Object { "x=$($_.x) y=$($_.y) w=$($_.w) h=$($_.h) area=$($_.area)" }
