function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)]
        [int]$NumOfDocs = 2,
		[Parameter(Mandatory = $false)]
        [string]$Profile = 'mini',
		[Parameter(Mandatory = $false)]
        [string]$Namespace = 'odsp-perf-lg-fluid',
        [Parameter(Mandatory = $false)]
        [string]$TestUid = [guid]::NewGuid()
    )

    if ( ( $NumOfDocs -gt 10 ) -and ( $Namespace -ne 'odsp-perf-lg-fluid' ) ) {
        Write-Host "Large tests should be run with namespace odsp-perf-lg-fluid. Exiting."
        return
    }

    Write-Output "Starting LoadTest for TestUid: $TestUid"

    $StorageAccountName = "fluidconfig"
	$StorageAccountKey = $env:StorageAccountKey

    $Profiles = Get-Content -Raw -Path .\testConfig.json | ConvertFrom-Json
    [int]$NumOfUsersPerDoc = $Profiles.profiles.$Profile.numClients
    Write-Host "NumOfDocs: $NumOfDocs, Profile: $Profile, NumOfUsersPerDoc: $NumOfUsersPerDoc"
	kubectl config set-context --current --namespace=$Namespace | out-null
	CreateInfra -NumOfPods $NumOfDocs -Namespace $Namespace -TestUid $TestUid -Profile $Profile -StorageAccountName $StorageAccountName -StorageAccountKey $StorageAccountKey
	CreateAndUploadConfig -Profile $Profile -Namespace $Namespace -NumOfUsersPerDoc $NumOfUsersPerDoc -NumOfDocs $NumOfDocs -TestUid $TestUid -StorageAccountName $StorageAccountName -StorageAccountKey $StorageAccountKey
	Write-Output "Triggered LoadTest for TestUid: $TestUid"
}

function CreateInfra{

	[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$NumOfPods,
		[Parameter(Mandatory = $true)]
        [string]$Namespace,
        [Parameter(Mandatory = $true)]
        [string]$TestUid,
		[Parameter(Mandatory = $true)]
        [string]$Profile,
		[Parameter(Mandatory = $true)]
        [string]$StorageAccountName,
		[Parameter(Mandatory = $true)]
        [string]$StorageAccountKey
    )

	kubectl create namespace $Namespace

	kubectl create secret generic fluid-config-store-secret --from-literal=azurestorageaccountname=$StorageAccountName --from-literal=azurestorageaccountkey=$StorageAccountKey -n $Namespace
	$FluidPodsDesc = Get-Content -Path load-generator-fluid-app.yaml
	$FluidPodsDesc -replace "{{FLUID_TEST_UID}}","$TestUid" -replace "{{TEST_PROFILE}}", "$Profile" | kubectl apply -n $Namespace -f -
    kubectl scale deployments lg-fluidapp -n $Namespace --replicas=$NumOfPods
    $RunningNumOfPods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running).count - 1
    while ($NumOfPods -ne $RunningNumOfPods) {
        Write-Host "Pods are in-progress"
        Start-Sleep -s 10
        $RunningNumOfPods = $(kubectl get pods -n $Namespace  --field-selector status.phase=Running).count - 1
    }
    Write-Host "Pods are created and running"
}

function CreateAndUploadConfig{
	[CmdletBinding()]
    Param(
		[Parameter(Mandatory = $true)]
        [string]$Profile,
		[Parameter(Mandatory = $true)]
        [string]$Namespace,
        [Parameter(Mandatory = $true)]
        [int]$NumOfUsersPerDoc,
        [Parameter(Mandatory = $true)]
        [int]$NumOfDocs,
        [Parameter(Mandatory = $true)]
        [string]$TestUid,
		[Parameter(Mandatory = $true)]
        [string]$StorageAccountName,
		[Parameter(Mandatory = $true)]
        [string]$StorageAccountKey
    )

    $Tenants = (Get-Content -Raw -Path testTenantConfig.json | ConvertFrom-Json).tenants
    $TenantNames = $Tenants | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
    $TenantsCount = $TenantNames.Count
	$Pods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    [int]$PodsCount = $Pods.count

    if ( $PodsCount -ne $NumOfDocs ) {
        Write-Error "Number of pods not equal to number of docs"
        return
     }

    Write-Output "Starting pod's configuration creation at $(Get-Date)"
    $TempPath = "\tmp"
	az storage directory create --account-key $StorageAccountKey  --account-name $StorageAccountName  --name $TestUid --share-name fluid-config-store
	$PodConfigPath = (Join-Path -Path $TempPath -ChildPath $TestUid)
	New-Item -Path $PodConfigPath -ItemType Directory | out-null
	foreach ($i in 1..$PodsCount) {
		$PodName = $Pods[$i - 1].metadata.name
        $TenantIndex = ($i-1) % $TenantsCount
		$TenantId = $TenantNames[$TenantIndex]
		$TenantContent = [PSCustomObject]@{
            credentials = $Tenants.$TenantId
		    rampup = $i
        }
		$LocalFile = (Join-Path -Path $PodConfigPath -ChildPath ($PodName + "_PodConfig.json"))
		$TenantContent | ConvertTo-Json | Out-File -Encoding ascii -FilePath $LocalFile
        Write-Output "Pod configuration created for PodNo:${i}, PodName:${PodName}`n"
    }
	Write-Output "Finished pod's configuration creation in the local directory: $PodConfigPath at $(Get-Date)`n"
	Write-Output "Starting pod's configuration upload into the file share: $StorageAccountName at $(Get-Date)"
	az storage file upload-batch --account-key $StorageAccountKey --account-name $StorageAccountName --source $PodConfigPath --destination "fluid-config-store/$TestUid" --max-connections 10
	$TestTriggerFile = (Join-Path -Path $PodConfigPath -ChildPath ($TestUid + "_Trigger.json"))
	Out-File -FilePath $TestTriggerFile
	az storage file upload --account-key $StorageAccountKey --account-name $StorageAccountName --share-name fluid-config-store --source $TestTriggerFile --path $TestUid
	Write-Output "Finished upload pod's configuration into file share: $StorageAccountName at $(Get-Date)`n"
}

function CheckTest{
	[CmdletBinding()]
    Param(
		[Parameter(Mandatory = $true)]
        [string]$Namespace
    )

	$Pods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    [int]$PodsCount = $Pods.count

    Write-Output "Checking test"

    foreach ($i in 1..$PodsCount) {
        $PodName = $Pods[$i - 1].metadata.name
        $Command = "ps -a | grep node"

        Write-Output "$PodName starting"
        kubectl exec $PodName -n $Namespace -- bash -c $Command
        if ($? -eq $false) {
            Exit 1
        }
        Write-Output "$PodName starting"
    }
}
