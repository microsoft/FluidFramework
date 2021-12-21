function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)]
        [int]$NumOfDocs = 2,

		[Parameter(Mandatory = $false)]
        [string]$Profile = 'mini',

		[Parameter(Mandatory = $false)]
        [string]$Namespace = 'fluid-scale-test',

        [Parameter(Mandatory = $false)]
        [string]$TestDocFolder = [Math]::Floor([decimal](Get-Date(Get-Date).ToUniversalTime() -uformat '%s')),

        [Parameter(Mandatory = $false)]
        [string]$TestUid = [guid]::NewGuid(),

        [Parameter(Mandatory = $false)]
        [string]$TestConfig = '.\testConfig.json',

        [Parameter(Mandatory = $false)]
        [string]$TestTenantConfig = '.\testTenantConfig.json'
    )

    # Input checks
    if ( ( $NumOfDocs -gt 10 ) -and ( $Namespace -ne 'fluid-scale-test' ) ) {
        Write-Host 'Large tests should be run with namespace fluid-scale-test. Exiting.'
        return
    }

    if ( $NumOfDocs -gt 2400 ) {
        Write-Host 'Can''t run test for more than 2400 docs.'
        return
    }

    Write-Output "Starting LoadTest for TestUid: $TestUid TestDocFolder: $TestDocFolder"

    $StorageAccountName = $env:StorageAccountName
	$StorageAccountKey = $env:StorageAccountKey
    $NumOfUsersPerDoc = (Get-Content -Raw -Path .\testConfig.json | ConvertFrom-Json).profiles.$Profile.numClients

    Write-Host "NumOfDocs: $NumOfDocs, Profile: $Profile, NumOfUsersPerDoc: $NumOfUsersPerDoc"

    # Create AKS pods
	CreateInfra `
        -NumOfPods $NumOfDocs `
        -Namespace $Namespace `
        -TestUid $TestUid `
        -Profile $Profile `
        -StorageAccountName $StorageAccountName `
        -StorageAccountKey $StorageAccountKey `
        -TestDocFolder $TestDocFolder

    # Create and upload configs for pods to trigger tests.
	CreateAndUploadConfig `
        -Profile $Profile `
        -Namespace $Namespace `
        -NumOfUsersPerDoc $NumOfUsersPerDoc `
        -NumOfDocs $NumOfDocs `
        -TestTenantConfig $TestTenantConfig `
        -TestUid $TestUid `
        -StorageAccountName $StorageAccountName `
        -StorageAccountKey $StorageAccountKey

    Write-Output "Triggered LoadTest for TestUid: $TestUid TestDocFolder: $TestDocFolder"
}

function CreateInfra{

    Param(
        [Parameter()]
        [int]$NumOfPods,
		[Parameter()]
        [string]$Namespace,
        [Parameter()]
        [string]$TestUid,
		[Parameter()]
        [string]$Profile,
		[Parameter()]
        [string]$StorageAccountName,
		[Parameter()]
        [string]$StorageAccountKey,
        [Parameter()]
        [string]$TestDocFolder
    )

    kubectl create namespace $Namespace
	kubectl create secret generic fluid-config-store-secret `
        --from-literal=azurestorageaccountname=$StorageAccountName `
        --from-literal=azurestorageaccountkey=$StorageAccountKey `
        -n $Namespace
    (Get-Content fluid-scale-test.yaml -Raw) -replace "{{FLUID_IMAGE_URL}}",$env:FluidImage | kubectl apply -n $Namespace -f -

    kubectl set env deployment/fluid-scale-test `
        FLUID_TEST_UID="$TestUid" `
        TEST_PROFILE="$Profile" `
        login__microsoft__clientId="$env:ClientId" `
        login__microsoft__secret="$env:ClientSecret" `
        APPINSIGHTS_INSTRUMENTATIONKEY="$env:InstrumentationKey" `
        BUILD_BUILD_ID="$TestDocFolder"

    kubectl scale deployments fluid-scale-test -n $Namespace --replicas=$NumOfPods

    # Wait until all pods are running.
    do {
        Write-Host "Pods are in-progress"
        Start-Sleep -s 10
        $RunningNumOfPods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running).count - 1
    } while ($NumOfPods -ne $RunningNumOfPods)

    Write-Host 'Pods are created and running.'
}

function CreateAndUploadConfig{

    Param(
		[Parameter()]
        [string]$Profile,
		[Parameter()]
        [string]$Namespace,
        [Parameter()]
        [int]$NumOfUsersPerDoc,
        [Parameter()]
        [int]$NumOfDocs,
        [Parameter()]
        [string]$TestUid,
        [Parameter()]
        [string]$TestTenantConfig,
		[Parameter()]
        [string]$StorageAccountName,
		[Parameter()]
        [string]$StorageAccountKey
    )

    $Tenants = (Get-Content -Raw -Path $TestTenantConfig | ConvertFrom-Json).tenants
    $TenantNames = $Tenants | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
    $TenantsCount = $TenantNames.Count

    $Pods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    $PodsCount = $Pods.count

    if ( $PodsCount -ne $NumOfDocs ) {
        Write-Error 'Number of pods not equal to number of docs.'
        return
    }

    Write-Output "Creating pod's configuration at $(Get-Date)"

    # Hast table stores index of url per tenant which can be used next time
    $TenantUrlIndexHt = [hashtable]::new()
    for ( $i = 0 ; $i -lt $TenantNames.length ; $i++ ) {
        $TenantUrlIndexHt[$TenantNames[$i]] = 0
    }

    # Create config file for each pod
	$PodConfigPath = (Join-Path -Path '\tmp' -ChildPath $TestUid)
	New-Item -Path $PodConfigPath -ItemType Directory | out-null
	foreach ($i in 1..$PodsCount) {
		$PodName = $Pods[$i - 1].metadata.name
        $TenantIndex = ($i-1) % $TenantsCount
        $TenantId = $TenantNames[$TenantIndex]
        $TenantContent = [PSCustomObject]@{
            credentials = $Tenants.$TenantId
		    rampup = $i
            docId = "doc$i"
        }
        $LocalFile = (Join-Path -Path $PodConfigPath -ChildPath "${PodName}_PodConfig.json")
		$TenantContent | ConvertTo-Json | Out-File -Encoding ascii -FilePath $LocalFile
        Write-Output "Pod configuration created for Pod No:$i, PodName:$PodName"
    }
	Write-Output "Created pod's configuration in the local directory: $PodConfigPath at $(Get-Date)"

	Write-Output "Uploading pod's configuration into the file share: $StorageAccountName at $(Get-Date)"

    az storage directory create `
        --account-key $StorageAccountKey `
        --account-name $StorageAccountName `
        --name $TestUid `
        --share-name fluid-config-store
	az storage file upload-batch `
        --account-key $StorageAccountKey `
        --account-name $StorageAccountName `
        --source $PodConfigPath `
        --destination "fluid-config-store/$TestUid" `
        --max-connections 10

    $TestTriggerFile = (Join-Path -Path $PodConfigPath -ChildPath "${TestUid}_Trigger.json")
	Out-File -FilePath $TestTriggerFile
	az storage file upload `
        --account-key $StorageAccountKey `
        --account-name $StorageAccountName `
        --share-name fluid-config-store `
        --source $TestTriggerFile `
        --path $TestUid

    Write-Output "Uploaded pod's configuration into file share: $StorageAccountName at $(Get-Date)"
}
