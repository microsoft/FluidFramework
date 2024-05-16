function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false, HelpMessage = 'Number of documents to run test on.')]
        [ValidateRange(1, 2400)]
        [int]$NumOfDocs = 2,

		[Parameter(Mandatory = $false, HelpMessage = 'Profile to run test with.')]
        [string]$TestProfile = 'mini',

		[Parameter(Mandatory = $false, HelpMessage = 'AKS Namespace.')]
        [string]$Namespace = 'fluid-scale-test',

        [Parameter(Mandatory = $false, HelpMessage = 'Folder to create in Storage for test files.')]
        [string]$TestDocFolder = [Math]::Floor([decimal](Get-Date(Get-Date).ToUniversalTime() -uformat '%s')),

        [Parameter(Mandatory = $false, HelpMessage = 'File with tenants and users information.')]
        [string]$TestTenantConfig = '.\testTenantConfig.json'
    )

    $TestUid = [guid]::NewGuid()

    Write-Output "Starting LoadTest for TestUid: $TestUid TestDocFolder: $TestDocFolder"

    kubectl create namespace $Namespace
    kubectl config set-context --current --namespace $Namespace

    # Create AKS pods
	CreateInfra -NumOfPods $NumOfDocs -TestUid $TestUid -TestProfile $TestProfile -TestDocFolder $TestDocFolder

    # Create and upload configs for pods to trigger tests.
	CreateAndUploadConfig -TestTenantConfig $TestTenantConfig -TestUid $TestUid

    Write-Output "Triggered LoadTest for TestUid: $TestUid TestDocFolder: $TestDocFolder"
}

function CreateInfra {

    Param(
        [Parameter()]
        [int]$NumOfPods,
        [Parameter()]
        [string]$TestUid,
		[Parameter()]
        [string]$TestProfile,
        [Parameter()]
        [string]$TestDocFolder
    )

	kubectl create secret generic fluid-config-store-secret `
        --from-literal=azurestorageaccountname=$env:AZURE_STORAGE_ACCOUNT `
        --from-literal=azurestorageaccountkey=$env:AZURE_STORAGE_KEY
    (Get-Content fluid-scale-test.yaml -Raw) -replace "{{FLUID_IMAGE_URL}}",$env:FluidImage | kubectl apply -f -

    kubectl set env deployment/fluid-scale-test `
        FLUID_TEST_UID="$TestUid" `
        TEST_PROFILE="$TestProfile" `
        login__microsoft__clientId="$env:ClientId" `
        APPINSIGHTS_INSTRUMENTATIONKEY="$env:InstrumentationKey" `
        BUILD_BUILD_ID="$TestDocFolder"

    kubectl scale deployments fluid-scale-test --replicas=$NumOfPods

    # Wait until all pods are running.
    do {
        Write-Output "Pods are in-progress"
        Start-Sleep -s 10
        $RunningNumOfPods = $(kubectl get pods --field-selector status.phase=Running).count - 1
    } while ($NumOfPods -ne $RunningNumOfPods)

    Write-Output 'Pods are created and running.'
}

function CreateAndUploadConfig{

    Param(
        [Parameter()]
        [string]$TestUid,
        [Parameter()]
        [string]$TestTenantConfig
    )

    $Tenants = (Get-Content -Raw -Path $TestTenantConfig | ConvertFrom-Json).tenants
    $TenantNames = $Tenants | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
    $TenantsCount = $TenantNames.Count

    $Pods = $(kubectl get pods --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    $PodsCount = $Pods.count

    Write-Output "Creating pod's configuration at $(Get-Date)"

    # Create config file for each pod
	$PodConfigPath = (Join-Path -Path $env:TEMP -ChildPath $TestUid)
	New-Item -Path $PodConfigPath -ItemType Directory | out-null
	foreach ( $i in 0..($PodsCount - 1) ) {
		$PodName = $Pods[$i].metadata.name
        $TenantId = $TenantNames[$i % $TenantsCount]
        $TenantContent = [PSCustomObject]@{
            credentials = $Tenants.$TenantId
		    rampup = $i
            docId = "doc$i"
        }
        $LocalFile = (Join-Path -Path $PodConfigPath -ChildPath "${PodName}_PodConfig.json")
		$TenantContent | ConvertTo-Json | Out-File -Encoding ascii -FilePath $LocalFile
        Write-Output "Pod configuration created for Pod No: $i, PodName: $PodName"
    }

	Write-Output "Uploading pod's configuration into the file share: $env:AZURE_STORAGE_ACCOUNT at $(Get-Date)"

    az storage directory create --name $TestUid --share-name fluid-config-store
	az storage file upload-batch --source $PodConfigPath --destination "fluid-config-store/$TestUid" --max-connections 10

    $TestTriggerFile = (Join-Path -Path $PodConfigPath -ChildPath "${TestUid}_Trigger.json")
	Out-File -FilePath $TestTriggerFile
	az storage file upload --share-name fluid-config-store --source $TestTriggerFile --path $TestUid

    Remove-Item -Force -Recurse $PodConfigPath
}
