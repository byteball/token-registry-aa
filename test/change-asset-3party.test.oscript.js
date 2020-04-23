const path = require('path')
// eslint-disable-next-line no-unused-vars
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe("Change symbol's asset to a new one by 3 parties", function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create().run()
		// this.explorer = await this.network.newObyteExplorer().ready()
		this.genesis = await this.network.getGenesisNode().ready();

		[
			this.deployer,
			this.alice,
			this.bob,
			this.charlie,
		] = await Utils.asyncStartHeadlessWallets(this.network, 4)

		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.deployer.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		console.error('----- genesis', unit)

		await this.network.witnessUntilStableOnNode(this.deployer, unit)

		const balance = await this.deployer.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Send bytes to Alice', async () => {
		this.aliceAddress = await this.alice.getAddress()
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: this.aliceAddress,
			amount: 100e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		console.error('---- to Alice', unit)

		await this.network.witnessUntilStableOnNode(this.alice, unit)
		console.error('----- to Alice witnessed')
		const balance = await this.alice.getBalance()
		expect(balance.base.stable).to.be.equal(100e9)
	})

	it('Send bytes to Bob', async () => {
		this.bobAddress = await this.bob.getAddress()
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: this.bobAddress,
			amount: 100e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStableOnNode(this.bob, unit)
		const balance = await this.bob.getBalance()
		expect(balance.base.stable).to.be.equal(100e9)
	})

	it('Send bytes to Charlie', async () => {
		this.charlieAddress = await this.charlie.getAddress()
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: this.charlieAddress,
			amount: 100e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
		const balance = await this.charlie.getBalance()
		expect(balance.base.stable).to.be.equal(100e9)
	})

	it('Deploy AA', async () => {
		const { address, unit, error } = await this.deployer.deployAgent(path.join(__dirname, '../token-registry.oscript'))

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		expect(address).to.be.validAddress

		this.aaAddress = address

	//	await this.network.witnessUntilStable(unit)
	})

	it('Alice defines an asset', async () => {
		const { unit, error } = await this.alice.createAsset({
			cap: 1e15,
			is_private: false,
			is_transferrable: true,
			auto_destroy: false,
			fixed_denominations: false,
			issued_by_definer_only: true,
			cosigned_by_definer: false,
			spender_attested: false,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		this.asset1 = unit
		console.error('---- asset', this.asset1)

	//	await this.network.witnessUntilStable(unit)
	})

	it('Bob defines an asset', async () => {
		const { unit, error } = await this.bob.createAsset({
			cap: 1e15,
			is_private: false,
			is_transferrable: true,
			auto_destroy: false,
			fixed_denominations: false,
			issued_by_definer_only: true,
			cosigned_by_definer: false,
			spender_attested: false,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		this.asset2 = unit
		console.error('---- asset', this.asset2)

		await this.network.witnessUntilStable(unit)
	})

	it('Alice registers a symbol for the asset', async () => {
		const symbol = 'USDC'
		const amount = 0.2e9
		const decimals = 6
		const description = 'USDC coin'
		const drawer_key = this.aliceAddress + '_' + 0 + '_' + symbol + '_' + this.asset1

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset1,
				decimals: decimals,
				description: description,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		//	await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.validUnit

		expect(response.response.responseVars.message).to.be.equal('Your description is now the current')
		expect(response.response.responseVars[symbol]).to.be.equal(this.asset1)
		expect(response.response.responseVars[this.asset1]).to.be.equal(symbol)
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset1]).to.be.equal(symbol)
		expect(vars['by_largest_a2s_' + this.asset1]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset1)
		expect(vars['by_largest_s2a_' + symbol]).to.be.equal(this.asset1)
		expect(vars['support_' + symbol + '_' + this.asset1]).to.be.equal(amount + '')
		expect(vars[drawer_key]).to.be.equal(amount + '')

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const dataPayload = unitObj.messages.find(m => m.app === 'data').payload
		expect(dataPayload.asset).to.be.equal(this.asset1)
		expect(dataPayload.name).to.be.equal(symbol)
		expect(dataPayload.decimals).to.be.equal(decimals)

		this.symbol = symbol
		this.asset1Support = amount
		this.decimals = decimals
	})

	it('Bob offers another asset for the symbol', async () => {
		const symbol = this.symbol
		const amount = 0.1e9
		const drawer_key = this.bobAddress + '_' + 0 + '_' + symbol + '_' + this.asset2

		const { unit, error } = await this.bob.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset2,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		//	await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null

		expect(response.response.responseVars.message).to.be.undefined
		expect(response.response.responseVars[symbol]).to.be.undefined
		expect(response.response.responseVars[this.asset]).to.be.undefined
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		const { vars } = await this.bob.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset1]).to.be.equal(this.symbol)
		expect(vars['s2a_' + this.symbol]).to.be.equal(this.asset1)
		expect(vars['by_largest_a2s_' + this.asset1]).to.be.equal(symbol)
		expect(vars['by_largest_a2s_' + this.asset2]).to.be.equal(symbol)
		expect(vars['by_largest_s2a_' + symbol]).to.be.equal(this.asset1)
		expect(vars['support_' + symbol + '_' + this.asset1]).to.be.equal(this.asset1Support + '')
		expect(vars['support_' + symbol + '_' + this.asset2]).to.be.equal(amount + '')
		expect(vars['expiry_ts_' + symbol]).to.be.undefined
		expect(vars[drawer_key]).to.be.equal(amount + '')

		this.asset2Support = amount
		this.bobsDeposit = amount
	})

	it('Bob posts decimals and description for his asset', async () => {
		const symbol = this.symbol
		const amount = 1e4
		const decimals = 5
		const description = 'Bobs USDC coin'

		const { unit, error } = await this.bob.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				asset: this.asset2,
				decimals: decimals,
				description: description,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		//	await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null

		expect(response.response.responseVars.message).to.be.equal('Your description is now the current')

		this.bobsDecimals = decimals
	})

	it('Charlie supports Bob', async () => {
		const symbol = this.symbol
		const amount = 0.2e9
		const drawer_key = this.charlieAddress + '_' + 0 + '_' + symbol + '_' + this.asset2

		const { unit, error } = await this.charlie.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset2,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		//	await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null

		expect(response.response.responseVars.message).to.be.undefined
		expect(response.response.responseVars[symbol]).to.be.undefined
		expect(response.response.responseVars[this.asset]).to.be.undefined
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		this.asset2Support += amount
		this.charliesDeposit = amount

		const { vars } = await this.charlie.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset1]).to.be.equal(this.symbol)
		expect(vars['a2s_' + this.asset2]).to.be.undefined
		expect(vars['s2a_' + this.symbol]).to.be.equal(this.asset1)
		expect(vars['by_largest_a2s_' + this.asset1]).to.be.equal(symbol)
		expect(vars['by_largest_a2s_' + this.asset2]).to.be.equal(symbol)
		expect(vars['by_largest_s2a_' + this.symbol]).to.be.equal(this.asset2)
		expect(vars['support_' + this.symbol + '_' + this.asset1]).to.be.equal(this.asset1Support + '')
		expect(vars['support_' + this.symbol + '_' + this.asset2]).to.be.equal(this.asset2Support + '')
		expect(vars['expiry_ts_' + this.symbol]).to.not.be.undefined
		expect(vars[drawer_key]).to.be.equal(amount + '')
	})

	it('Bob supports his asset again after expiry', async () => {
		const { time_error } = await this.network.timetravel({ shift: '31d' })
		expect(time_error).to.be.undefined

		const symbol = this.symbol
		const amount = 0.1e9
		const drawer_key = this.bobAddress + '_' + 0 + '_' + symbol + '_' + this.asset2

		const { unit, error } = await this.bob.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset2,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		//	await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.validUnit

		expect(response.response.responseVars.message).to.be.undefined
		expect(response.response.responseVars[symbol]).to.be.equal(this.asset2)
		expect(response.response.responseVars[this.asset2]).to.be.equal(symbol)
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		this.asset2Support += amount
		this.bobsDeposit += amount

		const { vars } = await this.bob.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset1]).to.be.undefined
		expect(vars['a2s_' + this.asset2]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset2)
		expect(vars['by_largest_a2s_' + this.asset1]).to.be.equal(symbol)
		expect(vars['by_largest_a2s_' + this.asset2]).to.be.equal(symbol)
		expect(vars['by_largest_s2a_' + symbol]).to.be.equal(this.asset2)
		expect(vars['support_' + symbol + '_' + this.asset1]).to.be.equal(this.asset1Support + '')
		expect(vars['support_' + symbol + '_' + this.asset2]).to.be.equal(this.asset2Support + '')
		expect(vars['expiry_ts_' + symbol]).to.be.undefined
		expect(vars[drawer_key]).to.be.equal(this.bobsDeposit + '')

		const { unitObj, error: er } = await this.bob.getUnitInfo({ unit: response.response_unit })
		console.log(er, response.response_unit)
		const dataPayload = unitObj.messages.find(m => m.app === 'data').payload
		expect(dataPayload.asset).to.be.equal(this.asset2)
		expect(dataPayload.name).to.be.equal(symbol)
		expect(dataPayload.decimals).to.be.equal(this.bobsDecimals)
	})

	it('Alice withdraws all', async () => {
		const symbol = this.symbol
		const amount = this.asset1Support
		const drawer_key = this.aliceAddress + '_' + 0 + '_' + symbol + '_' + this.asset1

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e4,
			data: {
				withdraw: 1,
				amount: amount,
				symbol: symbol,
				asset: this.asset1,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.validUnit
		//	await this.network.witnessUntilStable(response.response_unit)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset1]).to.be.undefined
		expect(vars['a2s_' + this.asset2]).to.be.equal(this.symbol)
		expect(vars['s2a_' + this.symbol]).to.be.equal(this.asset2)
		expect(vars[drawer_key]).to.be.equal('0')
		expect(vars['balance_' + this.aliceAddress + '_' + this.asset1]).to.be.equal('0')

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const paymentMessage = unitObj.messages.find(m => m.app === 'payment')
		const payout = paymentMessage.payload.outputs.find(out => out.address === this.aliceAddress)
		expect(payout.amount).to.be.equal(amount)
	})

	after(async () => {
		// uncomment this line to pause test execution to get time for Obyte DAG explorer inspection
		// await Utils.sleep(3600 * 1000)
		await this.network.stop()
	})
})
