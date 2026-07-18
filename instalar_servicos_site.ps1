# Instala o frontend (3000) e a API (3001) do SiteCD como serviços Windows (NSSM)
# e abre a firewall para a rede Tailscale + LAN.
# Correr como Administrador. Resultado escrito em instalar_servicos_site_resultado.txt

$ErrorActionPreference = 'Continue'
$PROJECT_DIR = "C:\Users\ruifarias\Claude\SiteCD"
$NSSM = "$PROJECT_DIR\sync-service\nssm.exe"
$NODE = "C:\Program Files\nodejs\node.exe"
$LOGS = "$PROJECT_DIR\logs"
$resultado = "$PROJECT_DIR\instalar_servicos_site_resultado.txt"
$linhas = @()

New-Item -ItemType Directory -Force $LOGS | Out-Null

# 1. Parar os processos node arrancados à mão nas portas 3000/3001 (apenas esses PIDs)
$pids = Get-NetTCPConnection -LocalPort 3000, 3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $pids) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
        Stop-Process -Id $processId -Force
        $linhas += "PARADO: node PID $processId (porta 3000/3001)"
    } else {
        $linhas += "AVISO: PID $processId na porta 3000/3001 nao e node ($($proc.ProcessName)) - nao parado"
    }
}
Start-Sleep -Seconds 2

# 2. Instalar serviços
$servicos = @(
    @{ Nome = 'ZAPP-SiteCD-Frontend'; Display = 'SiteCD Frontend (3000)'; Dir = "$PROJECT_DIR\frontend"; Params = 'server.js';     Desc = 'Frontend do site Classico Desportivo (porta 3000)' },
    @{ Nome = 'ZAPP-SiteCD-API';      Display = 'SiteCD API (3001)';      Dir = "$PROJECT_DIR\api";      Params = 'src\index.js'; Desc = 'API do site Classico Desportivo (porta 3001)' }
)

foreach ($s in $servicos) {
    $nome = $s.Nome
    if (Get-Service $nome -ErrorAction SilentlyContinue) {
        & $NSSM stop $nome | Out-Null
        & $NSSM remove $nome confirm | Out-Null
        Start-Sleep -Seconds 1
        $linhas += "REMOVIDO servico existente: $nome"
    }
    & $NSSM install $nome "$NODE" | Out-Null
    & $NSSM set $nome AppParameters $s.Params | Out-Null
    & $NSSM set $nome AppDirectory $s.Dir | Out-Null
    & $NSSM set $nome DisplayName $s.Display | Out-Null
    & $NSSM set $nome Description $s.Desc | Out-Null
    & $NSSM set $nome Start SERVICE_AUTO_START | Out-Null
    & $NSSM set $nome AppStdout "$LOGS\$nome.log" | Out-Null
    & $NSSM set $nome AppStderr "$LOGS\$nome`_erro.log" | Out-Null
    & $NSSM set $nome AppRotateFiles 1 | Out-Null
    & $NSSM set $nome AppRotateBytes 1048576 | Out-Null
    & $NSSM start $nome | Out-Null
    Start-Sleep -Seconds 2
    $estado = (Get-Service $nome -ErrorAction SilentlyContinue).Status
    $linhas += "SERVICO: $nome -> $estado"
}

# 3. Firewall: portas 3000/3001 apenas para Tailscale + LAN
$regra = "SiteCD 3000-3001 (Tailscale+LAN)"
try {
    Get-NetFirewallRule -DisplayName $regra -ErrorAction Stop | Remove-NetFirewallRule
    $linhas += "FIREWALL: regra existente removida"
} catch {}
try {
    New-NetFirewallRule -DisplayName $regra `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000, 3001 `
        -RemoteAddress @('100.64.0.0/10', '192.168.0.0/16') -ErrorAction Stop | Out-Null
    $linhas += "FIREWALL: regra criada ($regra)"
} catch {
    $linhas += "FIREWALL ERRO: $($_.Exception.Message)"
}

$linhas | Out-File -FilePath $resultado -Encoding utf8
