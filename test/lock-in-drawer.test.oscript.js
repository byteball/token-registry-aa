const path = require('path')
// eslint-disable-next-line no-unused-vars
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe('Lock funds in a drawer and withdraw after a warm-up period', function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create()
			.with.wallet({ alice: 100e9 })
			.with.asset({ asset: { cap: 1e15 } })
			.with.agent({ tr: path.join(__dirname, '../token-registry.oscript') })
			.run()
		this.alice = this.network.wallet.alice
		this.aliceAddress = await this.alice.getAddress()
		this.aaAddress = this.network.agent.tr
		this.asset = this.network.asset.asset
		
	//	this.explorer = await this.network.newObyteExplorer().ready()
		
		const balance = await this.alice.getBalance()
		expect(balance.base.stable).to.be.equal(100e9)
	})

	it('Alice registers a symbol for the asset', async () => {
		const symbol = 'USDC'
		const amount = 0.1e9
		const drawer = 7
		const decimals = 6
		const description = 'USDC coin'
		const drawer_key = this.aliceAddress + '_' + drawer + '_' + symbol + '_' + this.asset

		this.drawer = drawer

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: amount,
			data: {
				symbol: symbol,
				asset: this.asset,
				decimals: decimals,
				description: description,
				drawer: drawer,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response.responseVars.message).to.be.equal('Your description is now the current')
		expect(response.response.responseVars[symbol]).to.be.equal(this.asset)
		expect(response.response.responseVars[this.asset]).to.be.equal(symbol)
		expect(response.response.responseVars[drawer_key]).to.be.equal(amount)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal(amount + '')

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })
		const dataPayload = unitObj.messages.find(m => m.app === 'data').payload
		expect(dataPayload.asset).to.be.equal(this.asset)
		expect(dataPayload.name).to.be.equal(symbol)
		expect(dataPayload.decimals).to.be.equal(decimals)

		this.alicesDeposit = amount
	})

	it('Alice initiates a withdrawal', async () => {
		const symbol = 'USDC'
		const amount = this.alicesDeposit
		const drawer_key = this.aliceAddress + '_' + this.drawer + '_' + symbol + '_' + this.asset

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e4,
			data: {
				withdraw: 1,
				amount: amount,
				symbol: symbol,
				asset: this.asset,
				drawer: this.drawer,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null
		//	await this.network.witnessUntilStable(response.response_unit)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal(this.alicesDeposit + '')
		expect(vars['balance_' + this.aliceAddress + '_' + this.asset]).to.be.equal(this.alicesDeposit + '')
		expect(vars[drawer_key + '_expiry_ts']).to.not.be.undefined
	})

	it('Alice tries to complete the withdrawal too early', async () => {
		const { time_error } = await this.network.timetravel({ shift: '1h' })
		expect(time_error).to.be.undefined

		const symbol = 'USDC'
		const amount = this.alicesDeposit
		const drawer_key = this.aliceAddress + '_' + this.drawer + '_' + symbol + '_' + this.asset

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e4,
			data: {
				withdraw: 1,
				amount: amount,
				symbol: symbol,
				asset: this.asset,
				drawer: this.drawer,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.equal('warm-up period has not expired yet')
		expect(response.bounced).to.be.true
		//	await this.network.witnessUntilStable(response.response_unit)

		const { vars } = await this.alice.readAAStateVars(this.aaAddress)
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal(this.alicesDeposit + '')
		expect(vars['balance_' + this.aliceAddress + '_' + this.asset]).to.be.equal(this.alicesDeposit + '')
		expect(vars[drawer_key + '_expiry_ts']).to.not.be.undefined
	})

	it('Alice withdraws all', async () => {
		const { time_error } = await this.network.timetravel({ shift: '7d' })
		expect(time_error).to.be.undefined

		const symbol = 'USDC'
		const amount = this.alicesDeposit
		const drawer_key = this.aliceAddress + '_' + this.drawer + '_' + symbol + '_' + this.asset

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e4,
			data: {
				withdraw: 1,
				amount: amount,
				symbol: symbol,
				asset: this.asset,
				drawer: this.drawer,
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
		expect(vars['a2s_' + this.asset]).to.be.equal(symbol)
		expect(vars['s2a_' + symbol]).to.be.equal(this.asset)
		expect(vars[drawer_key]).to.be.equal('0')
		expect(vars[drawer_key + '_expiry_ts']).to.be.undefined
		expect(vars['balance_' + this.aliceAddress + '_' + this.asset]).to.be.equal('0')

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
