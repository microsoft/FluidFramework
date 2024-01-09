/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom, createWeightedGenerator, makeRandom } from "@fluid-private/stochastic-test-utils";
import { InsertableTypedNode } from "@fluidframework/tree";
import { Row } from "./schema";

const regionGenerator = createWeightedGenerator([
	["Europe", 2633],
	["Central America and the Caribbean", 1018],
	["Sub-Saharan Africa", 2603],
	["Australia and Oceania", 797],
	["North America", 215],
	["Middle East and North Africa", 1264],
	["Asia", 1469],
]);

const countryGenerator = createWeightedGenerator([
	["Montenegro", 69],
	["The Bahamas", 50],
	["Norway", 46],
	["Togo", 57],
	["Saint Kitts and Nevis ", 63],
	["Vanuatu", 48],
	["United States of America", 58],
	["Libya", 52],
	["Kazakhstan", 50],
	["Guinea", 62],
	["Malaysia", 52],
	["Republic of the Congo", 54],
	["Honduras", 57],
	["Antigua and Barbuda ", 49],
	["Democratic Republic of the Congo", 61],
	["Bosnia and Herzegovina", 53],
	["Bahrain", 64],
	["South Africa", 48],
	["Botswana", 69],
	["Palau", 52],
	["Pakistan", 44],
	["Seychelles ", 70],
	["Luxembourg", 54],
	["Myanmar", 55],
	["Nicaragua", 43],
	["Indonesia", 53],
	["Taiwan", 63],
	["Sao Tome and Principe", 53],
	["New Zealand", 58],
	["Angola", 54],
	["North Korea", 56],
	["Austria", 58],
	["Armenia", 46],
	["Croatia", 70],
	["Nepal", 45],
	["Portugal", 60],
	["Serbia", 60],
	["Spain", 51],
	["Ireland", 56],
	["Kiribati", 68],
	["Czech Republic", 46],
	["Moldova ", 71],
	["Albania", 55],
	["Kenya", 60],
	["Saint Vincent and the Grenadines", 44],
	["Russia", 57],
	["Greece", 53],
	["Panama", 50],
	["Guatemala", 58],
	["Macedonia", 50],
	["El Salvador", 64],
	["Malawi", 68],
	["Solomon Islands", 53],
	["Monaco", 48],
	["Japan", 55],
	["Jordan", 55],
	["Comoros", 49],
	["Vietnam", 57],
	["Djibouti", 57],
	["Egypt", 55],
	["South Korea", 60],
	["Zambia", 60],
	["Italy", 44],
	["Maldives", 51],
	["Georgia", 55],
	["Ghana", 56],
	["Tanzania", 49],
	["Fiji", 58],
	["Nigeria", 55],
	["Bhutan", 56],
	["Trinidad and Tobago", 48],
	["Rwanda", 66],
	["Denmark", 59],
	["Nauru", 52],
	["Iraq", 56],
	["Tunisia ", 58],
	["Cape Verde", 43],
	["Uzbekistan", 53],
	["Poland", 51],
	["Iceland", 58],
	["Swaziland", 64],
	["Zimbabwe", 59],
	["Liberia", 48],
	["Afghanistan", 59],
	["Cambodia", 66],
	["Turkey", 46],
	["Vatican City", 56],
	["Sierra Leone", 47],
	["Hungary", 52],
	["Central African Republic", 50],
	["Thailand", 54],
	["Jamaica", 49],
	["China", 53],
	["Bangladesh", 63],
	["Burundi", 66],
	["Yemen", 47],
	["Grenada", 61],
	["India", 63],
	["Kuwait", 59],
	["Morocco", 67],
	["Singapore", 44],
	["Switzerland", 57],
	["Lesotho", 58],
	["United Arab Emirates", 65],
	["Chad", 58],
	["Mozambique", 52],
	["Uganda", 55],
	["Oman", 52],
	["East Timor", 47],
	["Algeria", 51],
	["Latvia", 45],
	["Haiti", 49],
	["Madagascar", 53],
	["Mauritius ", 57],
	["Niger", 57],
	["South Sudan", 47],
	["United Kingdom", 72],
	["Sri Lanka", 56],
	["Lebanon", 50],
	["Andorra", 52],
	["Belgium", 43],
	["Sudan", 53],
	["Saudi Arabia", 49],
	["Estonia", 57],
	["Israel", 57],
	["Tajikistan", 40],
	["Saint Lucia", 39],
	["Dominican Republic", 47],
	["Benin", 62],
	["Belize", 43],
	["Laos", 50],
	["Slovenia", 63],
	["Sweden", 48],
	["Barbados", 49],
	["Liechtenstein", 65],
	["Ukraine", 57],
	["Federated States of Micronesia", 54],
	["Samoa ", 56],
	["Mongolia", 56],
	["The Gambia", 44],
	["Cote d'Ivoire", 44],
	["Burkina Faso", 49],
	["Kosovo", 64],
	["Guinea-Bissau", 54],
	["Australia", 51],
	["Belarus", 52],
	["Somalia", 56],
	["Mauritania", 53],
	["Cyprus", 49],
	["Philippines", 54],
	["Namibia", 49],
	["Canada", 67],
	["Kyrgyzstan", 56],
	["Marshall Islands", 45],
	["Senegal", 64],
	["France", 58],
	["Mali", 35],
	["Papua New Guinea", 50],
	["Lithuania", 72],
	["Germany", 54],
	["Ethiopia", 62],
	["Equatorial Guinea", 45],
	["Syria", 44],
	["Eritrea", 42],
	["Cuba", 50],
	["Tonga", 45],
	["Finland", 52],
	["Gabon", 47],
	["Tuvalu", 60],
	["Qatar", 58],
	["Slovakia", 42],
	["Turkmenistan", 58],
	["Greenland", 41],
	["Dominica", 52],
	["Azerbaijan", 56],
	["Cameroon", 46],
	["Netherlands", 57],
	["Iran", 62],
	["Costa Rica", 53],
	["Bulgaria", 46],
	["Romania", 53],
	["Mexico", 49],
	["Malta", 46],
	["Brunei", 47],
	["San Marino", 49],
]);

const itemTypeGenerator = createWeightedGenerator([
	["Vegetables", 836],
	["Beverages", 782],
	["Office Supplies", 837],
	["Meat", 798],
	["Personal Care", 888],
	["Clothes", 872],
	["Household", 875],
	["Cereal", 825],
	["Cosmetics", 834],
	["Snacks", 816],
	["Fruits", 795],
	["Baby Food", 842],
]);

const salesChannelGenerator = createWeightedGenerator([
	["Online", 5060],
	["Offline", 4940],
]);

const orderPriorityGenerator = createWeightedGenerator([
	["H", 2503],
	["M", 2448],
	["L", 2494],
	["C", 2555],
]);

const unitsSoldRangeGenerator = createWeightedGenerator([
	[[0, 50], 1577],
	[[50, 100], 888],
	[[100, 150], 872],
	[[150, 200], 1652],
	[[200, 250], 825],
	[[250, 300], 842],
	[[400, 450], 1632],
	[[650, 700], 1712],
]);

const unitsSoldGenerator = ({ random }: { random: IRandom }) => {
	const [min, max] = unitsSoldRangeGenerator({ random }) as [number, number];
	return random.integer(min, max - 1);
};

const unitCostRangeGenerator = createWeightedGenerator([
	[[0, 50], 2449],
	[[50, 100], 2540],
	[[100, 150], 825],
	[[150, 200], 842],
	[[250, 300], 834],
	[[350, 400], 798],
	[[500, 550], 1712],
]);

const unitCostGenerator = ({ random }: { random: IRandom }) => {
	const [min, max] = unitCostRangeGenerator({ random }) as [number, number];
	return random.integer(min * 100, max * 100 - 1) / 100;
};

const profitRangeGenerator = createWeightedGenerator([
	[[1.1, 1.2], 798],
	[[1.2, 1.3], 837],
	[[1.3, 1.4], 1670],
	[[1.4, 1.5], 1670],
	[[1.5, 1.6], 816],
	[[1.6, 1.7], 2512],
	[[1.7, 1.8], 825],
	[[3, 3.1], 872],
]);

const profitGenerator = ({ random }: { random: IRandom }) => {
	const [min, max] = profitRangeGenerator({ random }) as [number, number];
	return random.real(min, max);
};

const shippingDelayRangeGenerator = createWeightedGenerator([
	[[0, 200000000], 557],
	[[200000000, 400000000], 424],
	[[400000000, 600000000], 394],
	[[600000000, 800000000], 567],
	[[800000000, 1000000000], 385],
	[[1000000000, 1200000000], 388],
	[[1200000000, 1400000000], 584],
	[[1400000000, 1600000000], 401],
	[[1600000000, 1800000000], 384],
	[[1800000000, 2000000000], 574],
	[[2000000000, 2200000000], 368],
	[[2200000000, 2400000000], 392],
	[[2400000000, 2600000000], 630],
	[[2600000000, 2800000000], 417],
	[[2800000000, 3000000000], 400],
	[[3000000000, 3200000000], 610],
	[[3200000000, 3400000000], 403],
	[[3400000000, 3600000000], 390],
	[[3600000000, 3800000000], 420],
	[[3800000000, 4000000000], 552],
	[[4000000000, 4200000000], 375],
	[[4200000000, 4323600000], 385],
]);

const shippingDelayGenerator = ({ random }: { random: IRandom }) => {
	const [min, max] = shippingDelayRangeGenerator({ random }) as [number, number];
	return random.integer(min, max - 1);
};

const toDollars = (value: number) => Math.ceil(value * 100) / 100;

export function generateRow(random: IRandom): InsertableTypedNode<typeof Row> {
	const unitsSold = unitsSoldGenerator({ random });
	const unitCost = toDollars(unitCostGenerator({ random }));
	const profit = profitGenerator({ random });
	const unitPrice = toDollars(unitCost * profit);
	const totalRevenue = toDollars(unitPrice * unitsSold);
	const totalCost = toDollars(unitCost * unitsSold);
	const totalProfit = toDollars(totalRevenue - totalCost);
	const orderDate = random.integer(1262332800000, 1501225200000);
	const shippingDate = orderDate + shippingDelayGenerator({ random });

	return {
		"Order ID": random.integer(100000000, 999999999),
		"Region": regionGenerator({ random }) as string,
		"Country": countryGenerator({ random }) as string,
		"Item Type": itemTypeGenerator({ random }) as string,
		"Sales Channel": salesChannelGenerator({ random }) as string,
		"Order Priority": orderPriorityGenerator({ random }) as string,
		"Units Sold": unitsSold,
		"Unit Price": unitPrice,
		"Unit Cost": unitCost,
		"Total Revenue": totalRevenue,
		"Total Cost": totalCost,
		"Total Profit": totalProfit,
		"Order Date": orderDate,
		"Ship Date": shippingDate,
	};
}

export function generateTable(rows = 10, seed = 1) {
	const random = makeRandom(seed);

	return Array.from({ length: rows }, () => generateRow(random)).sort(
		(left, right) => left["Order ID"] - right["Order ID"],
	);
}
