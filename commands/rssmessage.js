const dbOps = require('../util/dbOps.js')
const config = require('../config.json')
const log = require('../util/logger.js')
const MenuUtils = require('../structs/MenuUtils.js')
const FeedSelector = require('../structs/FeedSelector.js')
function feedSelectorFn (m, data, callback) {
  const { guildRss, rssName } = data
  const source = guildRss.sources[rssName]
  const currentMsg = source.message ? '```Markdown\n' + source.message + '```' : '```Markdown\nNone has been set. Currently using default message below:\n\n``````\n' + config.feeds.defaultMessage + '```'

  callback(null, { guildRss: guildRss,
    rssName: rssName,
    next: {
      text: `The current message for ${source.link} is: \n${currentMsg}\nType your new customized message now, type \`reset\` to use the default message, or type \`exit\` to cancel. \n\nRemember that you can use the placeholders \`{title}\`, \`{description}\`, \`{link}\`, and etc. \`{empty}\` will create an empty message, but only if an embed is used. Regular formatting such as **bold** and etc. is also available. To find other placeholders, type \`exit\` then \`${config.bot.prefix}rsstest\`.\n\n` }
  })
}

function setMessage (m, data, callback) {
  const { guildRss, rssName } = data
  const source = guildRss.sources[rssName]
  const input = m.content

  if (input.toLowerCase() === 'reset') callback(null, { setting: null, guildRss: guildRss, rssName: rssName })
  else if (input === '{empty}' && (typeof source.embedMessage !== 'object' || typeof source.embedMessage.properties !== 'object' || Array.isArray(source.embedMessage.properties) || Object.keys(source.embedMessage.properties).length === 0)) {
    callback(new SyntaxError('You cannot have an empty message if there is no embed used for this feed. Try again.')) // Allow empty messages only if embed is enabled
  } else callback(null, { setting: input, guildRss: guildRss, rssName: rssName })
}

module.exports = (bot, message, command) => {
  const feedSelector = new FeedSelector(message, feedSelectorFn, { command: command })
  const messagePrompt = new MenuUtils.Menu(message, setMessage)

  new MenuUtils.MenuSeries(message, [feedSelector, messagePrompt]).start(async (err, data) => {
    try {
      if (err) return err.code === 50013 ? null : await message.channel.send(err.message)
      const { setting, guildRss, rssName } = data
      const source = guildRss.sources[rssName]

      if (setting === null) {
        const m = await message.channel.send(`Resetting message...`)
        delete guildRss.sources[rssName].message
        dbOps.guildRss.update(guildRss)
        log.command.info(`Message reset for ${source.link}`, message.guild)
        await m.edit(`Message reset and using default message:\n \`\`\`Markdown\n${config.feeds.defaultMessage}\`\`\` \nfor feed ${source.link}`)
      } else {
        const m = await message.channel.send(`Updating message...`)
        source.message = setting
        dbOps.guildRss.update(guildRss)
        log.command.info(`New message recorded for ${source.link}`, message.guild)
        await m.edit(`Message recorded:\n \`\`\`Markdown\n${setting.replace('`', '​`')}\`\`\` \nfor feed <${source.link}>. You may use \`${config.bot.prefix}rsstest\` to see your new message format.${setting.search(/{subscriptions}/) === -1 ? ` Note that because there is no \`{subscriptions}\`, whatever role subscriptions you add through ${config.bot.prefix}rssroles will *not* appear in this feed's article messages. After completely setting up, it is recommended that you use ${config.bot.prefix}rssbackup to have a personal backup of your settings.` : ` After completely setting up, it is recommended that you use ${config.bot.prefix}rssbackup to have a personal backup of your settings.`}`) // Escape backticks in code blocks by inserting zero-width space before each backtick
      }
    } catch (err) {
      log.command.warning(`rssmessage`, message.guild, err)
    }
  })
}
