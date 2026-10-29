/** Pure read-only margin scenario; no financial systems, side effects or dispatch. */
export function calculateGrossMarginScenario({revenue,directCost,targetMarginPercent=45}={}){
 if(!Number.isFinite(revenue)||revenue<=0||!Number.isFinite(directCost)||directCost<0||!Number.isFinite(targetMarginPercent)||targetMarginPercent<0||targetMarginPercent>100)throw new RangeError('Valid positive revenue, nonnegative direct cost and target 0-100 required');
 const grossProfit=revenue-directCost;
 const actualMarginPercent=grossProfit/revenue*100;
 const maximumDirectCost=Math.round(revenue*(100-targetMarginPercent))/100;
 const costReductionRequired=Math.max(0,directCost-maximumDirectCost);
 return Object.freeze({kind:'READ_ONLY_GROSS_MARGIN_SCENARIO',revenue,directCost,grossProfit,actualMarginPercent,targetMarginPercent,maximumDirectCost,costReductionRequired,meetsTarget:actualMarginPercent>=targetMarginPercent,source:'USER_SUPPLIED_SCENARIO_NOT_ACCOUNTING_DATA',dispatchEnabled:false,approvalStatus:'NOT_REQUESTED'});
}
