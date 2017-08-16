param(
    [string]$ResourceGroupName,
    [string]$ResourceName,
    [string]$TargetSlot)

$ParametersObject = @{
	targetSlot = $TargetSlot
}

Write-Host "Deploying to $TargetSlot"
Invoke-AzureRmResourceAction -ResourceGroupName $ResourceGroupName -ResourceType Microsoft.Web/sites/slots -ResourceName $ResourceName -Action slotsswap -Parameters $ParametersObject -ApiVersion 2015-07-01 -Force
Write-Host "Done"